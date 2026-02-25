# Part 3: Frontend Data and Services

The frontend uses standard TypeScript models and a dedicated service layer to interact with the Appwrite backend functions.

## 1. Appwrite Client Initialization

Create a file `src/services/appwrite.ts`. This initializes the SDK and exports the serverless function IDs.

```typescript
import { Client, Functions, Databases } from 'appwrite';

const client = new Client()
    .setEndpoint('https://nyc.cloud.appwrite.io/v1') // Your Appwrite Endpoint
    .setProject('YOUR_PROJECT_ID'); // Replace with your Project ID

export const functions = new Functions(client);
export const databases = new Databases(client);

// Replace these with the generated IDs from the Appwrite Console
export const VERIFY_FUNCTION_ID = 'verify-access-code';
export const SEND_RESULTS_FUNCTION_ID = 'send-test-results';
```

## 2. Question Data Models

Create `src/data/questionsData.ts`. This file defines the TypeScript interfaces for our 3 question types, provides default fallback questions, and houses the `saveQuestions` API wrapper. We wrap the questions in a `TestDataPayload` to securely save test configuration settings to the database.

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
                false, // Synchronous mode internally handles the execution wait list
                undefined,
                ExecutionMethod.POST,
            );
            return result.responseBody || null;
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.warn(`Function attempt ${attempt}/${MAX_RETRIES} failed: ${msg}`);
            if (attempt < MAX_RETRIES) await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
        }
    }
    return null;
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

*Note: You do not see a `loadQuestions` function here because we implemented a massive performance optimization in Part 2. The questions are pre-loaded during authentication, skipping an extra cold-start round trip.*

## 3. Email Delivery Service

Create `src/services/emailService.ts` to assemble the graded answers and fire off the delivery request.

```typescript
import { ExecutionMethod } from 'appwrite';
import { functions, SEND_RESULTS_FUNCTION_ID } from './appwrite';
import type { Question } from '../data/questionsData';

export async function sendResults(
    firstName: string,
    lastName: string,
    answers: Record<number, string | string[]>,
    questions: Question[],
    accessCode: string
): Promise<void> {
    const htmlReport = formatResults(firstName, lastName, answers, questions, accessCode);
    const subject = `Assessment Results: ${firstName} ${lastName}`;

    const result = await functions.createExecution(
        SEND_RESULTS_FUNCTION_ID,
        JSON.stringify({ subject, message: htmlReport }),
        false,
        undefined,
        ExecutionMethod.POST
    );

    if (result.status === 'failed' || !result.responseBody) {
        throw new Error('Failed to execute email function');
    }

    const parsed = JSON.parse(result.responseBody);
    if (!parsed.ok) throw new Error(parsed.error || 'Failed to send email');
}

function formatResults(
    first: string, 
    last: string, 
    answers: Record<number, string | string[]>, 
    questions: Question[],
    accessCode: string
): string {
    // Basic grade calculation
    let score = 0;
    
    // ... logic to calculate score based on comparing answers against questions.correctIndex/Indices ...
    
    return `Student ${first} ${last} scored ${score}/${questions.length}.`;
}
```
