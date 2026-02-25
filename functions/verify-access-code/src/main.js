const DATABASE_ID = 'test-app-db';
const COLLECTION_ID = 'questions';
const ENDPOINT = 'https://nyc.cloud.appwrite.io/v1';

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

async function listDocs(baseUrl, headers, log) {
    const limitQ = JSON.stringify({ method: 'limit', values: [1] });
    const url = `${baseUrl}?queries[]=${encodeURIComponent(limitQ)}`;
    log(`LIST: ${url}`);
    const resp = await fetch(url, { headers });
    const text = await resp.text();
    log(`LIST response ${resp.status}: ${text.substring(0, 200)}`);
    if (!resp.ok) return null;
    const data = JSON.parse(text);
    if (data.documents && data.documents.length > 0) return data.documents[0];
    return null;
}

export default async ({ req, res, log, error }) => {
    if (req.method !== 'POST') {
        return res.json({ ok: false, error: 'Method not allowed' }, 405);
    }

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        const { code, action, questions } = body;

        if (!code) return res.json({ ok: false, valid: false, error: 'No code provided' }, 400);

        const accessCode = process.env.ACCESS_CODE;
        const editorCode = process.env.EDITOR_CODE;
        if (!accessCode) {
            error('ACCESS_CODE not set');
            return res.json({ ok: false, error: 'Server config error' }, 500);
        }

        const trimmedCode = code.trim().toUpperCase();
        const isEditor = editorCode && trimmedCode === editorCode.trim().toUpperCase();
        const isStudent = trimmedCode === accessCode.trim().toUpperCase();

        // ── Load questions ──
        if (action === 'load-questions') {
            if (!isEditor && !isStudent) return res.json({ ok: false, error: 'Unauthorized' }, 403);
            if (!process.env.APPWRITE_API_KEY) return res.json({ ok: true, questions: null });

            const { baseUrl, headers } = getDbConfig(log);
            const doc = await listDocs(baseUrl, headers, log);
            if (doc && doc.data) {
                log('Returning saved questions');
                return res.json({ ok: true, questions: JSON.parse(doc.data) });
            }
            log('No saved questions found');
            return res.json({ ok: true, questions: null });
        }

        // ── Save questions ──
        if (action === 'save-questions') {
            if (!isEditor) return res.json({ ok: false, error: 'Unauthorized' }, 403);
            if (!questions) return res.json({ ok: false, error: 'No questions provided' }, 400);
            if (!process.env.APPWRITE_API_KEY) {
                error('APPWRITE_API_KEY not set');
                return res.json({ ok: false, error: 'Server config error' }, 500);
            }

            const { baseUrl, headers } = getDbConfig(log);
            const dataStr = JSON.stringify(questions);
            const doc = await listDocs(baseUrl, headers, log);

            if (doc) {
                log(`Updating doc ${doc.$id}`);
                const resp = await fetch(`${baseUrl}/${doc.$id}`, {
                    method: 'PATCH',
                    headers,
                    body: JSON.stringify({ data: { data: dataStr } }),
                });
                const text = await resp.text();
                log(`UPDATE ${resp.status}: ${text.substring(0, 200)}`);
                if (!resp.ok) return res.json({ ok: false, error: 'Failed to save' }, 500);
            } else {
                log('Creating new doc');
                const resp = await fetch(baseUrl, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ documentId: 'unique()', data: { data: dataStr } }),
                });
                const text = await resp.text();
                log(`CREATE ${resp.status}: ${text.substring(0, 200)}`);
                if (!resp.ok) return res.json({ ok: false, error: 'Failed to save' }, 500);
            }
            return res.json({ ok: true, saved: true });
        }

        // ── Default: verify code ──
        if (isEditor) {
            log('Valid: editor');
            return res.json({ ok: true, valid: true, role: 'editor' });
        }
        if (isStudent) {
            log('Valid: student');
            return res.json({ ok: true, valid: true, role: 'student' });
        }
        log('Invalid code');
        return res.json({ ok: true, valid: false });
    } catch (err) {
        error(`${err.message}\n${err.stack}`);
        return res.json({ ok: false, error: 'Internal error' }, 500);
    }
};
