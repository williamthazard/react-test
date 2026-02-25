# Part 2: Serverless Backend Functions

This application relies on two Node.js Serverless Functions deployed to Appwrite. These act as secure proxies for our database and mail server.

## 1. The Auth and Storage Proxy (`verify-access-code`)

This function is the most complex piece of the backend. It serves three purposes:
1. Validating Access Codes (student vs. editor)
2. Returning the test questions (piggybacked instantly with the authentication response to eliminate painful cold-start timeouts).
3. Saving updated test questions from the editor.

### Prerequisites
In your Appwrite project, create a new Node.js function. Set the following Environment Variables in the function settings:
- `ACCESS_CODE` (e.g. `TEST2026`)
- `EDITOR_CODE` (e.g. `EDIT2026`)
- `APPWRITE_API_KEY` (The server API key created in Part 1)
- `APPWRITE_FUNCTION_PROJECT_ID` (Added automatically by Appwrite)

### Function Code (`src/main.js`)

```javascript
import fetch from 'node-fetch'; // Appwrite Node 18 runtime has global fetch, but explicit is fine

const DATABASE_ID = 'test-app-db';
const COLLECTION_ID = 'questions';
const ENDPOINT = 'https://nyc.cloud.appwrite.io/v1';

// Helper to construct DB API headers
function getDbConfig(log) {
    const apiKey = process.env.APPWRITE_API_KEY;
    const projectId = process.env.APPWRITE_FUNCTION_PROJECT_ID;
    const baseUrl = `${ENDPOINT}/databases/${DATABASE_ID}/collections/${COLLECTION_ID}/documents`;
    const headers = {
        'Content-Type': 'application/json',
        'X-Appwrite-Project': projectId,
        'X-Appwrite-Key': apiKey,
    };
    log(`Config: projectId=${projectId}, apiKey=${apiKey ? 'set' : 'MISSING'}`);
    return { baseUrl, headers };
}

// Helper to fetch the single questions document
async function listDocs(baseUrl, headers, log) {
    // Note: Appwrite 1.8+ requires JSON encoded queries, NOT raw strings like limit(1)
    const limitQ = JSON.stringify({ method: 'limit', values: [1] });
    const url = `${baseUrl}?queries[]=${encodeURIComponent(limitQ)}`;
    
    const resp = await fetch(url, { headers });
    const text = await resp.text();
    if (!resp.ok) return null;
    
    const data = JSON.parse(text);
    if (data.documents && data.documents.length > 0) return data.documents[0];
    return null;
}

export default async ({ req, res, log, error }) => {
    if (req.method !== 'POST') return res.json({ ok: false, error: 'Method not allowed' }, 405);

    try {
        // Handle variations in how Appwrite passes the body payload
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        const { code, action, questions } = body;

        if (!code) return res.json({ ok: false, valid: false, error: 'No code provided' }, 400);

        const accessCode = process.env.ACCESS_CODE;
        const editorCode = process.env.EDITOR_CODE;

        // Validation mapping
        const trimmedCode = code.trim().toUpperCase();
        const isEditor = editorCode && trimmedCode === editorCode.trim().toUpperCase();
        const isStudent = trimmedCode === accessCode.trim().toUpperCase();

        // ── Action: Save questions ──
        if (action === 'save-questions') {
            if (!isEditor) return res.json({ ok: false, error: 'Unauthorized' }, 403);
            
            const { baseUrl, headers } = getDbConfig(log);
            const dataStr = JSON.stringify(questions);
            const doc = await listDocs(baseUrl, headers, log);

            if (doc) {
                // Update existing document
                await fetch(`${baseUrl}/${doc.$id}`, {
                    method: 'PATCH',
                    headers,
                    body: JSON.stringify({ data: { data: dataStr } }),
                });
            } else {
                // Create new document
                await fetch(baseUrl, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ documentId: 'unique()', data: { data: dataStr } }),
                });
            }
            return res.json({ ok: true, saved: true });
        }

        // ── Default Action: Verify Code & Preload Questions ──
        if (isEditor || isStudent) {
            const role = isEditor ? 'editor' : 'student';
            
            // Critical architecture decision: We actively fetch and return the questions 
            // inside the authentication response. This completely eliminates a second round-trip 
            // cold-start delay when the client tries to load questions immediately after login.
            let loadedQuestions = null;
            if (process.env.APPWRITE_API_KEY) {
                try {
                    const { baseUrl, headers } = getDbConfig(log);
                    const doc = await listDocs(baseUrl, headers, log);
                    if (doc && doc.data) {
                        loadedQuestions = JSON.parse(doc.data);
                    }
                } catch (e) {
                    log(`Pre-load failed: ${e.message}`);
                }
            }

            return res.json({ ok: true, valid: true, role, questions: loadedQuestions });
        }
        
        return res.json({ ok: true, valid: false });
    } catch (err) {
        error(`${err.message}\n${err.stack}`);
        return res.json({ ok: false, error: 'Internal error' }, 500);
    }
};
```

**Important Deployment Note:** Serverless functions can suffer from "cold starts" (taking seconds to boot up after being idle). In the Appwrite console, upgrade this function's specification from `s-0.5vcpu-512mb` to `s-1vcpu-1gb` and set its **Timeout to 120 seconds**. This prevents errors where Appwrite forcefully terminates synchronous HTTP calls during slow cold starts.

## 2. The Email Proxy (`send-test-results`)

This function receives the graded HTML test results from the client and sends it out via the Postal mail API.

### Prerequisites
Create a second Node.js function in Appwrite. Set the environment variable:
- `POSTAL_API_KEY` (Your Postal Server API Key)

### Function Code (`src/main.js`)

```javascript
const POSTAL_URL = 'https://postal.msg.yourdomain.com/api/v1/send/message';
const SENDER = 'noreply@yourdomain.com';
const RECIPIENT = 'teacher@school.edu';

export default async ({ req, res, log, error }) => {
    if (req.method !== 'POST') return res.json({ ok: false, error: 'Method not allowed' }, 405);

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        const { subject, message } = body;

        const apiKey = process.env.POSTAL_API_KEY;

        const postalResponse = await fetch(POSTAL_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Server-API-Key': apiKey,
            },
            body: JSON.stringify({
                to: [RECIPIENT],
                from: SENDER,
                subject: subject,
                plain_body: message, // Or html_body if preferred
            }),
        });

        const postalData = await postalResponse.json();

        if (postalData.status === 'success') {
            return res.json({ ok: true });
        } else {
            return res.json({ ok: false, error: 'Failed to send email' }, 500);
        }
    } catch (err) {
        return res.json({ ok: false, error: 'Internal server error' }, 500);
    }
};
```

Deploy both functions using the Appwrite CLI (`npx appwrite functions create-deployment ...`) to ensure your local code correctly maps to the server.
