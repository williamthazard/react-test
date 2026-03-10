# Part 2: Serverless Backend Functions

This application relies on two Node.js Serverless Functions deployed to Appwrite. These act as secure proxies for our database and mail server.

## 1. The Auth and Storage Proxy (`verify-access-code`)

This function is the most complex piece of the backend. It serves three purposes:
1. Validating Access Codes (student vs. editor)
2. Returning the test questions (piggybacked instantly with the authentication response to eliminate painful cold-start timeouts).
3. Saving updated test questions from the editor.

### Prerequisites
In your Appwrite project, create a new Node.js function. Set the following Environment Variables in the function settings:
- `ACCESS_CODE` (e.g. `STUDENT-CODE-HERE`)
- `EDITOR_CODE` (e.g. `EDITOR-CODE-HERE`)
- `APPWRITE_API_KEY` (The server API key created in Part 1)
- `APPWRITE_FUNCTION_PROJECT_ID` (Added automatically by Appwrite)

### Function Code (`src/main.js`)

```javascript
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

// Helper to fetch the single questions document.
// We call this from both the verify path (to preload questions) and the save path
// (to check whether a document already exists so we know to PATCH vs POST).
async function listDocs(baseUrl, headers, log) {
    // Appwrite 1.8+ requires queries to be JSON-encoded objects, not raw strings like "limit(1)".
    // The query object format is { method: 'limit', values: [1] }.
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
                // PATCH updates an existing document in place — we pass the document's $id
                // in the URL and only send the fields we want to change.
                await fetch(`${baseUrl}/${doc.$id}`, {
                    method: 'PATCH',
                    headers,
                    body: JSON.stringify({ data: { data: dataStr } }),
                });
            } else {
                // POST creates a new document. 'unique()' is a special Appwrite string that
                // tells the server to auto-generate a unique document ID — we don't need to
                // track or predict it because listDocs will always find it by querying the collection.
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

        // Slow down invalid-code responses to make brute-force attacks impractical.
        // A 2-second artificial delay means an attacker can only try ~30 codes per minute
        // regardless of network speed. Correct codes return before reaching this line,
        // so legitimate users are never affected.
        await new Promise(r => setTimeout(r, 2000));
        return res.json({ ok: true, valid: false });
    } catch (err) {
        error(`${err.message}\n${err.stack}`);
        return res.json({ ok: false, error: 'Internal error' }, 500);
    }
};
```

**JavaScript patterns used in this function:**

**Arrow functions** — `export default async ({ req, res, log, error }) => { ... }` uses JavaScript's arrow function syntax: `(parameters) => { body }`. Arrow functions are equivalent to `function(parameters) { body }` for most purposes — the shorter syntax is just the modern convention. You'll see them everywhere in this codebase, from one-liners like `const add = (a, b) => a + b` to multi-line async functions like this one.

**Destructured function parameters** — `export default async ({ req, res, log, error }) => {` receives a single context object from Appwrite and immediately destructures it into named variables. This is equivalent to `async (context) => { const { req, res, log, error } = context; ... }`. Appwrite calls your function with this exact object shape; the names `req`, `res`, `log`, and `error` are Appwrite's API contract — use these exact names.

**`process.env`** — In Node.js, `process.env` is a global object containing all environment variables configured for the running process. When you set `ACCESS_CODE = STUDENT-CODE-HERE` in the Appwrite console under the function's settings, it becomes readable inside the function as `process.env.ACCESS_CODE`. This is the standard, secure way to supply secrets to server-side code — the values never appear in source files or version control.

**Defensive body parsing** — `typeof req.body === 'string' ? JSON.parse(req.body) : req.body` handles an Appwrite runtime quirk. When invoked through the Appwrite SDK (as our frontend does), the body may arrive as a pre-parsed JavaScript object. When called directly over HTTP, it arrives as a raw JSON string. The ternary covers both cases by only calling `JSON.parse` when needed.

**Early returns** — Throughout the function, `return res.json(...)` both sends the HTTP response and immediately exits the function. This avoids deeply nested `if/else` chains and makes each logical branch easy to read in isolation.

**Cold Starts and Deployment Sizing:** Serverless functions run in containers that are spun up on demand and shut down after a period of inactivity. The first request after a period of idle time incurs a "cold start" penalty — the container has to boot, load the Node.js runtime, and execute the module before it can process the request. On the default `s-0.5vcpu-512mb` specification, this can take 3–8 seconds, which is long enough for Appwrite's synchronous execution timeout to fire and kill the request before a response is sent.

In the Appwrite console, upgrade this function's specification to `s-1vcpu-1gb` and set its **Timeout to 120 seconds**. The larger spec boots faster. The longer timeout ensures that even a slow cold start completes before Appwrite terminates the execution. The `AccessCodeWall` component (Part 4) also fires a background warm-up request on page load to further reduce the chance of a cold start hitting a real user action.

## 2. The Email Proxy (`send-test-results`)

This function receives the graded HTML test results from the client and sends it out via the Postal mail API.

### Prerequisites
Create a second Node.js function in Appwrite. Set the environment variable:
- `POSTAL_API_KEY` (Your Postal Server API Key)

### Function Code (`src/main.js`)

```javascript
const POSTAL_URL = 'https://postal.msg.yourdomain.com/api/v1/send/message';
const SENDER = 'noreply@yourdomain.com';

// This is the address used if no recipients have been configured in the editor.
// It ensures results are never silently lost even on a fresh install.
const FALLBACK_RECIPIENT = 'teacher@school.edu';

export default async ({ req, res, log, error }) => {
    if (req.method !== 'POST') return res.json({ ok: false, error: 'Method not allowed' }, 405);

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

        // recipients is a string[] forwarded from the editor's TestConfig.recipientEmails.
        // If the editor has configured at least one address, we use that list.
        // Otherwise we fall back to the hardcoded FALLBACK_RECIPIENT so nothing is silently lost.
        const { subject, message, recipients } = body;
        const toList = (Array.isArray(recipients) && recipients.length > 0)
            ? recipients
            : [FALLBACK_RECIPIENT];

        const apiKey = process.env.POSTAL_API_KEY;

        const postalResponse = await fetch(POSTAL_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Server-API-Key': apiKey,
            },
            body: JSON.stringify({
                to: toList,   // Postal accepts an array, so multiple recipients work natively
                from: SENDER,
                subject: subject,
                plain_body: message,
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

### Deploying the Functions

Each function's source code lives in its own folder under `functions/`. Each folder needs a `package.json` that declares ES module support:

```json
{
    "name": "send-test-results",
    "version": "1.0.0",
    "type": "module",
    "main": "src/main.js"
}
```

The `"type": "module"` field is essential — without it, Node.js treats `.js` files as CommonJS and the `export default` syntax in `main.js` will throw a syntax error at runtime.

Your project root needs an `appwrite.json` file with your Project ID:

```json
{
    "projectId": "YOUR_PROJECT_ID"
}
```

Then deploy each function from its own directory using the Appwrite CLI:

```bash
# Deploy verify-access-code
cd functions/verify-access-code
appwrite functions create-deployment \
  --function-id verify-access-code \
  --entrypoint src/main.js \
  --code . \
  --activate true

# Deploy send-test-results
cd ../send-test-results
appwrite functions create-deployment \
  --function-id your-send-results-function-id \
  --entrypoint src/main.js \
  --code . \
  --activate true
```

`--activate true` sets the new deployment as the live version immediately. You can find your function IDs in the Appwrite console under Functions → [function name] → Settings → Function ID. After deploying, verify in the console that the deployment status shows "Ready" before testing the application.
