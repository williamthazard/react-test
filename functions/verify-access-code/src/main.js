const ACCESS_CODE_KEY = 'ACCESS_CODE';
const EDITOR_CODE_KEY = 'EDITOR_CODE';

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

        const { code } = body;

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

        // Check editor code first
        if (editorCode && trimmedCode === editorCode.trim().toUpperCase()) {
            log('Access code check: valid (editor)');
            return res.json({ ok: true, valid: true, role: 'editor' });
        }

        // Check student code
        if (trimmedCode === accessCode.trim().toUpperCase()) {
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
