const DATABASE_ID = 'test-app-db';
const COLLECTION_ID = 'questions';

export default async ({ req, res, log, error }) => {
    const endpoint = process.env.APPWRITE_FUNCTION_API_ENDPOINT || 'https://nyc.cloud.appwrite.io/v1';
    const projectId = process.env.APPWRITE_FUNCTION_PROJECT_ID;
    const apiKey = process.env.APPWRITE_API_KEY;

    if (!apiKey) {
        error('APPWRITE_API_KEY environment variable not set');
        return res.json({ ok: false, error: 'Server configuration error' }, 500);
    }

    const headers = {
        'Content-Type': 'application/json',
        'X-Appwrite-Project': projectId,
        'X-Appwrite-Key': apiKey,
    };

    const baseUrl = `${endpoint}/databases/${DATABASE_ID}/collections/${COLLECTION_ID}/documents`;

    try {
        if (req.method === 'GET') {
            const resp = await fetch(`${baseUrl}?queries[]=limit(1)`, { headers });
            if (!resp.ok) {
                const errText = await resp.text();
                log(`List docs failed (${resp.status}): ${errText}`);
                return res.json({ ok: true, questions: null });
            }
            const data = await resp.json();
            if (data.documents && data.documents.length > 0) {
                return res.json({ ok: true, questions: JSON.parse(data.documents[0].data) });
            }
            return res.json({ ok: true, questions: null });
        }

        if (req.method === 'POST') {
            let body;
            if (typeof req.body === 'string') {
                body = JSON.parse(req.body);
            } else {
                body = req.body;
            }

            const { questions } = body;
            if (!questions) {
                return res.json({ ok: false, error: 'No questions provided' }, 400);
            }

            const dataStr = JSON.stringify(questions);

            // Check if doc exists
            const listResp = await fetch(`${baseUrl}?queries[]=limit(1)`, { headers });
            let existingDocId = null;
            if (listResp.ok) {
                const listData = await listResp.json();
                if (listData.documents && listData.documents.length > 0) {
                    existingDocId = listData.documents[0].$id;
                }
            }

            if (existingDocId) {
                // Update
                const updateResp = await fetch(`${baseUrl}/${existingDocId}`, {
                    method: 'PATCH',
                    headers,
                    body: JSON.stringify({ data: dataStr }),
                });
                if (!updateResp.ok) {
                    const errText = await updateResp.text();
                    error(`Update failed (${updateResp.status}): ${errText}`);
                    return res.json({ ok: false, error: 'Failed to update questions' }, 500);
                }
                log('Updated existing questions document');
            } else {
                // Create
                const createResp = await fetch(baseUrl, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        documentId: 'unique()',
                        data: { data: dataStr },
                    }),
                });
                if (!createResp.ok) {
                    const errText = await createResp.text();
                    error(`Create failed (${createResp.status}): ${errText}`);
                    return res.json({ ok: false, error: 'Failed to create questions' }, 500);
                }
                log('Created new questions document');
            }

            return res.json({ ok: true });
        }

        return res.json({ ok: false, error: 'Method not allowed' }, 405);
    } catch (err) {
        error(`Exception: ${err.message}\n${err.stack}`);
        return res.json({ ok: false, error: 'Internal server error' }, 500);
    }
};
