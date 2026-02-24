import { questions } from '../data/questionsData';
import { ExecutionMethod } from 'appwrite';
import { functions, SEND_RESULTS_FUNCTION_ID } from './appwrite';

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
            const result = await functions.createExecution(
                SEND_RESULTS_FUNCTION_ID,
                JSON.stringify({
                    subject: `Assessment Test Results – ${studentName}`,
                    message: formattedResults,
                }),
                false, // synchronous
                undefined,
                ExecutionMethod.POST,
            );

            if (result.status === 'failed') {
                throw new Error('Appwrite execution failed (cold start timeout)');
            }

            if (result.responseBody) {
                try {
                    const parsed = JSON.parse(result.responseBody);
                    if (!parsed.ok) {
                        throw new Error(parsed.error || 'Unknown error from function');
                    }
                    success = true;
                } catch (e) {
                    if (e instanceof SyntaxError) {
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
            await new Promise(r => setTimeout(r, 1000));
        }
    }
}
