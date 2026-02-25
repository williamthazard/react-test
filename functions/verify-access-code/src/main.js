const ACCESS_CODE_KEY = 'ACCESS_CODE';
const EDITOR_CODE_KEY = 'EDITOR_CODE';
const DATABASE_ID = 'test-app-db';
const COLLECTION_ID = 'questions';

async function getDbHeaders() {
    const apiKey = process.env.APPWRITE_API_KEY;
    const endpoint = process.env.APPWRITE_FUNCTION_API_ENDPOINT || 'https://nyc.cloud.appwrite.io/v1';
    const projectId = process.env.APPWRITE_FUNCTION_PROJECT_ID;
    return {
        endpoint,
        headers: {
            'Content-Type': 'application/json',
            'X-Appwrite-Project': projectId,
            'X-Appwrite-Key': apiKey,
        },
        baseUrl: `${endpoint}/databases/${DATABASE_ID}/collections/${COLLECTION_ID}/documents`,
    };
}

export default async ({ req, res, log, error }) => {
    if (req.method !== 'POST') {
        return res.json({ ok: false, error: 'Method not allowed' }, 405);
    }

    try {
        let body;
        if (typeof req.body === 'string') {
            body = JSON.parse(req.body);
        } else {
            body = req.body;
        }

        const { code, action, questions } = body;

        if (!code) {
            return res.json({ ok: false, valid: false, error: 'No code provided' }, 400);
        }

        const accessCode = process.env[ACCESS_CODE_KEY];
        const editorCode = process.env[EDITOR_CODE_KEY];

        if (!accessCode) {
            error('ACCESS_CODE environment variable is not set');
            return res.json({ ok: false, error: 'Server configuration error' }, 500);
        }

        const trimmedCode = code.trim().toUpperCase();
        const isEditor = editorCode && trimmedCode === editorCode.trim().toUpperCase();
        const isStudent = trimmedCode === accessCode.trim().toUpperCase();
        const isAuthorized = isEditor || isStudent;

        // ─── Load questions (requires any valid code) ───
        if (action === 'load-questions') {
            if (!isAuthorized) {
                return res.json({ ok: false, error: 'Unauthorized' }, 403);
            }

            const apiKey = process.env.APPWRITE_API_KEY;
            if (!apiKey) {
                error('APPWRITE_API_KEY not set');
                return res.json({ ok: true, questions: null });
            }

            try {
                const { baseUrl, headers } = await getDbHeaders();
                const resp = await fetch(`${baseUrl}?queries[]=limit(1)`, { headers });
                if (resp.ok) {
                    const data = await resp.json();
                    if (data.documents && data.documents.length > 0) {
                        return res.json({ ok: true, questions: JSON.parse(data.documents[0].data) });
                    }
                }
            } catch (e) {
                log(`Load questions error: ${e.message}`);
            }
            return res.json({ ok: true, questions: null });
        }

        // ─── Save questions (requires editor code) ───
        if (action === 'save-questions') {
            if (!isEditor) {
                log('Save attempt denied: not an editor');
                return res.json({ ok: false, error: 'Unauthorized' }, 403);
            }
            if (!questions) {
                return res.json({ ok: false, error: 'No questions provided' }, 400);
            }

            const apiKey = process.env.APPWRITE_API_KEY;
            if (!apiKey) {
                error('APPWRITE_API_KEY not set');
                return res.json({ ok: false, error: 'Server configuration error' }, 500);
            }

            const { baseUrl, headers } = await getDbHeaders();
            const dataStr = JSON.stringify(questions);

            // Check for existing document
            const listResp = await fetch(`${baseUrl}?queries[]=limit(1)`, { headers });
            let existingDocId = null;
            if (listResp.ok) {
                const listData = await listResp.json();
                if (listData.documents && listData.documents.length > 0) {
                    existingDocId = listData.documents[0].$id;
                }
            }

            if (existingDocId) {
                const updateResp = await fetch(`${baseUrl}/${existingDocId}`, {
                    method: 'PATCH',
                    headers,
                    body: JSON.stringify({ data: { data: dataStr } }),
                });
                if (!updateResp.ok) {
                    const errText = await updateResp.text();
                    error(`Update failed (${updateResp.status}): ${errText}`);
                    return res.json({ ok: false, error: 'Failed to save' }, 500);
                }
                log('Updated questions document');
            } else {
                const createResp = await fetch(baseUrl, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ documentId: 'unique()', data: { data: dataStr } }),
                });
                if (!createResp.ok) {
                    const errText = await createResp.text();
                    error(`Create failed (${createResp.status}): ${errText}`);
                    return res.json({ ok: false, error: 'Failed to save' }, 500);
                }
                log('Created questions document');
            }

            return res.json({ ok: true, saved: true });
        }

        // ─── Default: verify access code ───
        if (isEditor) {
            log('Access code check: valid (editor)');
            return res.json({ ok: true, valid: true, role: 'editor' });
        }

        if (isStudent) {
            log('Access code check: valid (student)');
            return res.json({ ok: true, valid: true, role: 'student' });
        }

        log('Access code check: invalid');
        return res.json({ ok: true, valid: false });
    } catch (err) {
        error(`Exception: ${err.message}\n${err.stack}`);
        return res.json({ ok: false, error: 'Internal server error' }, 500);
    }
};
