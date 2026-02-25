import { Client, Databases, ID, Query } from 'node-appwrite';

const DATABASE_ID = 'test-app-db';
const COLLECTION_ID = 'questions';

export default async ({ req, res, log, error }) => {
    const client = new Client()
        .setEndpoint('https://nyc.cloud.appwrite.io/v1')
        .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
        .setKey(process.env.APPWRITE_API_KEY);

    const databases = new Databases(client);

    try {
        if (req.method === 'GET') {
            // Read saved questions
            try {
                const docs = await databases.listDocuments(DATABASE_ID, COLLECTION_ID, [
                    Query.limit(1),
                ]);
                if (docs.documents.length > 0) {
                    const doc = docs.documents[0];
                    return res.json({ ok: true, questions: JSON.parse(doc.data) });
                }
                return res.json({ ok: true, questions: null });
            } catch (e) {
                // Collection might not exist yet
                log(`No saved questions found: ${e.message}`);
                return res.json({ ok: true, questions: null });
            }
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

            // Try to update existing doc, or create new one
            try {
                const docs = await databases.listDocuments(DATABASE_ID, COLLECTION_ID, [
                    Query.limit(1),
                ]);
                if (docs.documents.length > 0) {
                    await databases.updateDocument(DATABASE_ID, COLLECTION_ID, docs.documents[0].$id, {
                        data: dataStr,
                    });
                    log('Updated existing questions document');
                } else {
                    await databases.createDocument(DATABASE_ID, COLLECTION_ID, ID.unique(), {
                        data: dataStr,
                    });
                    log('Created new questions document');
                }
            } catch (e) {
                error(`Failed to save questions: ${e.message}\n${e.stack}`);
                return res.json({ ok: false, error: 'Failed to save questions' }, 500);
            }

            return res.json({ ok: true });
        }

        return res.json({ ok: false, error: 'Method not allowed' }, 405);
    } catch (err) {
        error(`Exception: ${err.message}\n${err.stack}`);
        return res.json({ ok: false, error: 'Internal server error' }, 500);
    }
};
