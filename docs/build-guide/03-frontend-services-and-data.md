# Part 3: Frontend Data and Services

The frontend uses standard TypeScript models and a dedicated service layer to interact with the Appwrite backend functions.

> **TypeScript in a nutshell:** The frontend is written in TypeScript, a superset of JavaScript that adds optional type annotations. When you see `string`, `number`, `boolean`, or `string[]` after a `:` in a declaration, that's TypeScript telling the compiler what kind of value is expected. When you see `type Foo = { ... }` or `interface Foo { ... }`, those are blueprints that describe the shape of an object. TypeScript checks these at build time — it will refuse to compile if you try to pass a `number` where a `string` is expected, or access a property that doesn't exist on a type. This catches an entire class of bugs before they reach users. You don't have to memorize all of TypeScript upfront — the types in this file are the foundation, and the patterns will become familiar as you see them repeated throughout the rest of the guide.

## 1. Appwrite Client Initialization

Create a file `src/services/appwrite.ts`. This initializes the Appwrite SDK client and exports references to it that every other service file imports. Centralizing initialization here means there is exactly one client instance in the entire app.

```typescript
import { Client, Functions, Databases } from 'appwrite';

const client = new Client()
    .setEndpoint('https://nyc.cloud.appwrite.io/v1') // Your Appwrite Endpoint
    .setProject('YOUR_PROJECT_ID'); // Replace with your Project ID

export const functions = new Functions(client);
export const databases = new Databases(client);

// Function IDs are found in the Appwrite Console under Functions → [function name] → Settings → Function ID.
// The verify-access-code function uses its name as its ID if you created it that way;
// the send-test-results function will have an auto-generated alphanumeric ID.
export const VERIFY_FUNCTION_ID = 'verify-access-code';
export const SEND_RESULTS_FUNCTION_ID = 'your-send-results-function-id';
```

> **Note on the `databases` export:** The `Databases` object is initialized and exported from `appwrite.ts` but is not used by any of our frontend code — all database access goes through the serverless functions. It is exported for completeness in case you want to add a direct database query in the future, but you can omit it and only keep the `Functions` export if you prefer a leaner setup.

## 2. Question Data Models

Create `src/data/questionsData.ts`. This file defines the TypeScript interfaces for our 3 question types, provides default fallback questions, and houses the `loadQuestions` and `saveQuestions` API wrappers.

The `Question` type is a **union type** — `MultipleChoiceQuestion | MultipleAnswerQuestion | EssayQuestion`. TypeScript union types let a value be one of several named types. Throughout the app, when we have a `Question` and need to access type-specific fields like `options` or `correctIndex`, TypeScript requires us to first narrow the type with a check like `if (q.type === 'multiple-choice')` or a cast like `q as MultipleChoiceQuestion`. This prevents runtime errors from accessing properties that don't exist on all question variants.

The `TestDataPayload` wrapper (`{ settings: TestConfig, questions: Question[] }`) is what gets serialized to JSON and stored as the single `data` string in Appwrite. Wrapping both together means a single save and load operation atomically updates all configuration — there's no risk of settings and questions going out of sync.

```typescript
import { ExecutionMethod } from 'appwrite';
import { functions, VERIFY_FUNCTION_ID } from '../services/appwrite';

export type MultipleChoiceQuestion = {
    id: number;
    type: 'multiple-choice';
    prompt: string;
    imageUrl?: string; // Stored as a Base64 string
    options: string[];
    correctIndex: number;
    randomizeOptions?: boolean;
};

export type MultipleAnswerQuestion = {
    id: number;
    type: 'multiple-answer';
    prompt: string;
    imageUrl?: string;
    options: string[];
    correctIndices: number[];
    randomizeOptions?: boolean;
};

export type EssayQuestion = {
    id: number;
    type: 'essay';
    prompt: string;
    imageUrl?: string;
};

export type Question = MultipleChoiceQuestion | MultipleAnswerQuestion | EssayQuestion;

export type TestConfig = {
    randomizeQuestions?: boolean;
    recipientEmails?: string[];
};

export type TestDataPayload = {
    settings: TestConfig;
    questions: Question[];
};

export const defaultQuestions: Question[] = [
    {
        id: 1,
        type: 'multiple-choice',
        prompt: 'What is the sum of 2 + 2?',
        options: ['3', '4', '5'],
        correctIndex: 1,
    }
];

// ── Secure Saving Wrapper ──
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 3000;

async function executeWithRetry(body: string): Promise<string | null> {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const result = await functions.createExecution(
                VERIFY_FUNCTION_ID,
                body,
                false, // false = synchronous execution: we await the function's response inline.
                       // true would fire the function asynchronously and return immediately without a result.
                undefined,
                ExecutionMethod.POST,
            );
            return result.responseBody || null;
        } catch (e) {
            // TypeScript types a caught value as `unknown` — it could be an Error, a string, or anything.
            // `instanceof Error` checks whether it's a real Error object before reading `.message`.
            // `String(e)` safely converts any other type to a printable string as a fallback.
            const msg = e instanceof Error ? e.message : String(e);
            console.warn(`Function attempt ${attempt}/${MAX_RETRIES} failed: ${msg}`);
            if (attempt < MAX_RETRIES) await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
        }
    }
    return null;
}

export async function loadQuestions(code: string): Promise<TestDataPayload> {
    const responseBody = await executeWithRetry(
        // The backend function only explicitly routes on action === 'save-questions'.
        // Any other value (including 'load-questions') falls through to the default path,
        // which verifies the code and returns preloaded questions. The 'load-questions'
        // value is included for clarity, not because the server checks it specifically.
        JSON.stringify({ code, action: 'load-questions' }),
    );

    // Default fallback state
    const fallback: TestDataPayload = { settings: {}, questions: defaultQuestions };

    if (responseBody) {
        try {
            const parsed = JSON.parse(responseBody);
            if (parsed.ok && parsed.questions) {
                // Handle both older array formats and newer object payloads
                if (Array.isArray(parsed.questions)) {
                    return { settings: {}, questions: parsed.questions as Question[] };
                } else if (parsed.questions.questions) {
                    return parsed.questions as TestDataPayload;
                }
            }
            if (parsed.ok && !parsed.questions) {
                return fallback;
            }
        } catch {
            console.warn('Failed to parse load-questions response');
        }
    }
    throw new Error('Failed to load questions — server unreachable');
}

export async function saveQuestions(code: string, payload: TestDataPayload): Promise<void> {
    const responseBody = await executeWithRetry(
        // Pass the entire { settings, questions } payload directly into the 'questions' field 
        // to avoid needing to redeploy the backend function for minor data schema updates.
        JSON.stringify({ code, action: 'save-questions', questions: payload }),
    );
    if (!responseBody) throw new Error('Failed to save — server completely unreachable');
    
    const parsed = JSON.parse(responseBody);
    if (!parsed.ok) throw new Error(parsed.error || 'Failed to save questions');
}
```

## 3. Email Delivery Service

Create `src/services/emailService.ts`. This file has two responsibilities: grading the student's answers by comparing them against the stored correct answers, and sending the formatted report to the `send-test-results` cloud function.

Note that `formatResults` calls `loadQuestions` to fetch the current questions from the server at submission time. This is intentional — it ensures the grading is always done against the authoritative server copy of the questions and correct answers, not a client-side snapshot that could theoretically be tampered with.

```typescript
import { loadQuestions, type MultipleChoiceQuestion, type MultipleAnswerQuestion } from '../data/questionsData';
import { ExecutionMethod } from 'appwrite';
import { functions, SEND_RESULTS_FUNCTION_ID } from './appwrite';

// Record<K, V> is TypeScript's built-in utility type for plain objects used as lookup maps.
// Record<number, string | string[]> means: keys are numbers (question IDs), values are
// either a string (single answer for MC/essay) or string[] (multiple selections for MA questions).
type Answers = Record<number, string | string[]>;

// formatResults loads the questions from the server, grades each answer,
// and returns the plain-text report alongside the configured recipient list.
async function formatResults(answers: Answers, studentName: string, code: string): Promise<{ message: string; recipients: string[] }> {
    const payload = await loadQuestions(code);
    const questions = payload.questions;
    // `?.` is optional chaining: if payload.settings is null/undefined, the whole expression
    // returns undefined instead of throwing an error. `??` is nullish coalescing: it returns
    // the right side only when the left side is null or undefined — here, defaulting to [].
    const recipients = payload.settings?.recipientEmails ?? [];
    const lines: string[] = [];
    let mcCorrect = 0;
    let mcTotal = 0;

    for (const q of questions) {
        if (q.type === 'multiple-choice') {
            mcTotal++;
            const mc = q as MultipleChoiceQuestion;
            const answer = (answers[q.id] as string) || '(no answer)';
            const correctOption = mc.options[mc.correctIndex];
            const isCorrect = answer === correctOption;
            if (isCorrect) mcCorrect++;

            lines.push(
                `Q${q.id} [Multiple Choice] ${isCorrect ? '✓ CORRECT' : '✗ INCORRECT'}`,
                `  Prompt: ${q.prompt}`,
                `  Selected: ${answer}`,
                `  Correct Answer: ${correctOption}`,
                ''
            );
        } else if (q.type === 'multiple-answer') {
            mcTotal++;
            const ma = q as MultipleAnswerQuestion;
            const selected = (answers[q.id] as string[]) || [];
            const correctOptions = ma.correctIndices.map((i) => ma.options[i]);
            const isCorrect =
                selected.length === correctOptions.length &&
                correctOptions.every((o) => selected.includes(o));
            if (isCorrect) mcCorrect++;

            lines.push(
                `Q${q.id} [Multiple Answer] ${isCorrect ? '✓ CORRECT' : '✗ INCORRECT'}`,
                `  Prompt: ${q.prompt}`,
                `  Selected: ${selected.length > 0 ? selected.join(', ') : '(no answer)'}`,
                `  Correct Answers: ${correctOptions.join(', ')}`,
                ''
            );
        } else {
            // Essay questions are not graded — they are included as-is for the teacher to review
            const answer = (answers[q.id] as string) || '(no answer)';
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

    return { message: [...header, ...lines].join('\n'), recipients };
}

// sendResults is the public function called by TestPage on submission.
// It formats the results, then sends them to the send-test-results cloud function
// with retry logic in case of cold-start timeouts.
export async function sendResults(answers: Answers, studentName: string, code: string): Promise<void> {
    const { message: formattedResults, recipients } = await formatResults(answers, studentName, code);
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
                    recipients, // forwarded to the cloud function; empty array triggers the fallback address
                }),
                false,
                undefined,
                ExecutionMethod.POST,
            );

            if (result.status === 'failed') {
                throw new Error('Appwrite execution failed (cold start timeout)');
            }

            if (result.responseBody) {
                const parsed = JSON.parse(result.responseBody);
                if (!parsed.ok) throw new Error(parsed.error || 'Unknown error from function');
                success = true;
            } else {
                success = true; // no body but no failure — treat as success
            }
        } catch (err) {
            retryCount++;
            if (retryCount >= maxRetries) throw err;
            await new Promise(r => setTimeout(r, 1000));
        }
    }
}
```
