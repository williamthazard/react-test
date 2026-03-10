const POSTAL_URL = 'https://postal.msg.yourdomain.com/api/v1/send/message';
const FALLBACK_RECIPIENT = 'teacher@school.edu';
const SENDER = 'noreply@yourdomain.com';

export default async ({ req, res, log, error }) => {
    // Only accept POST
    if (req.method !== 'POST') {
        return res.json({ ok: false, error: 'Method not allowed' }, 405);
    }

    try {
        // Appwrite may pass req.body as a string or already-parsed object
        let body;
        if (typeof req.body === 'string') {
            body = JSON.parse(req.body);
        } else {
            body = req.body;
        }

        const { subject, message, recipients } = body;
        const toList = (Array.isArray(recipients) && recipients.length > 0) ? recipients : [FALLBACK_RECIPIENT];

        if (!subject || !message) {
            error(`Missing fields. Got keys: ${Object.keys(body).join(', ')}`);
            return res.json({ ok: false, error: 'Missing subject or message' }, 400);
        }

        const apiKey = process.env.POSTAL_API_KEY;
        if (!apiKey) {
            error('POSTAL_API_KEY environment variable is not set');
            return res.json({ ok: false, error: 'Server configuration error' }, 500);
        }

        log(`Sending test results to ${toList.join(', ')} via Postal...`);
        log(`Subject: ${subject}`);

        const postalResponse = await fetch(POSTAL_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Server-API-Key': apiKey,
            },
            body: JSON.stringify({
                to: toList,
                from: SENDER,
                subject: subject,
                plain_body: message,
            }),
        });

        const postalText = await postalResponse.text();
        log(`Postal response: ${postalText}`);

        let postalData;
        try {
            postalData = JSON.parse(postalText);
        } catch {
            error(`Postal returned non-JSON: ${postalText}`);
            return res.json({ ok: false, error: 'Invalid response from mail server' }, 500);
        }

        if (postalData.status === 'success') {
            log('Email sent successfully');
            return res.json({ ok: true });
        } else {
            error(`Postal API error: ${postalText}`);
            return res.json({ ok: false, error: 'Failed to send email' }, 500);
        }
    } catch (err) {
        error(`Exception: ${err.message}\n${err.stack}`);
        return res.json({ ok: false, error: 'Internal server error' }, 500);
    }
};
