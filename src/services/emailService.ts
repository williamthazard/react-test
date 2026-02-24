import { questions } from '../data/questionsData';

// ─────────────────────────────────────────────
// Appwrite Configuration
// ─────────────────────────────────────────────
const APPWRITE_ENDPOINT = 'https://nyc.cloud.appwrite.io/v1';
const APPWRITE_PROJECT_ID = '699de9370020d5f42bdf';
const FUNCTION_ID = '699debf48829a77a155d';

type Answers = Record<number, string>;

function formatResults(answers: Answers, studentName: string): string {
    const lines: string[] = [];
    let mcCorrect = 0;
    let mcTotal = 0;

    for (const q of questions) {
        const answer = answers[q.id] || '(no answer)';

        if (q.type === 'multiple-choice') {
            mcTotal++;
            const correctOption = q.options[q.correctIndex];
            const isCorrect = answer === correctOption;
            if (isCorrect) mcCorrect++;

            lines.push(
                `Q${q.id} [Multiple Choice] ${isCorrect ? '✓ CORRECT' : '✗ INCORRECT'}`,
                `  Prompt: ${q.prompt}`,
                `  Selected: ${answer}`,
                `  Correct Answer: ${correctOption}`,
                ''
            );
        } else {
            lines.push(
                `Q${q.id} [Essay]`,
                `  Prompt: ${q.prompt}`,
                `  Answer: ${answer}`,
                ''
            );
        }
    }

    const header = [
        '═══════════════════════════════════',
        '       ASSESSMENT TEST RESULTS',
        '═══════════════════════════════════',
        `Student: ${studentName}`,
        `Submitted: ${new Date().toLocaleString()}`,
        `Multiple Choice Score: ${mcCorrect}/${mcTotal}`,
        '',
        '───────────────────────────────────',
        '',
    ];

    return [...header, ...lines].join('\n');
}

export async function sendResults(answers: Answers, studentName: string): Promise<void> {
    const formattedResults = formatResults(answers, studentName);
    let retryCount = 0;
    const maxRetries = 3;
    let success = false;

    while (retryCount < maxRetries && !success) {
        try {
            const response = await fetch(
                `${APPWRITE_ENDPOINT}/functions/${FUNCTION_ID}/executions`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Appwrite-Project': APPWRITE_PROJECT_ID,
                    },
                    body: JSON.stringify({
                        body: JSON.stringify({
                            subject: `Assessment Test Results – ${studentName}`,
                            message: formattedResults,
                        }),
                    }),
                }
            );

            if (!response.ok) {
                throw new Error(`Function execution failed: ${response.status}`);
            }

            const result = await response.json();

            // If it timed out internally on Appwrite (e.g., status 500 or 408)
            if (result.status === 'failed') {
                throw new Error('Appwrite execution failed (cold start timeout)');
            }

            // Check if the function returned an error
            if (result.responseBody) {
                try {
                    const parsed = JSON.parse(result.responseBody);
                    if (!parsed.ok) {
                        throw new Error(parsed.error || 'Unknown error from function');
                    }
                    success = true;
                } catch (e) {
                    if (e instanceof SyntaxError) {
                        // responseBody wasn't JSON, that's ok
                        success = true;
                    } else {
                        throw e;
                    }
                }
            } else {
                success = true;
            }
        } catch (err) {
            retryCount++;
            if (retryCount >= maxRetries) {
                throw err;
            }
            // Wait 1 second before retrying
            await new Promise(r => setTimeout(r, 1000));
        }
    }
}
