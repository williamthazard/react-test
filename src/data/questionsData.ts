
export type MultipleChoiceQuestion = {
    id: number;
    type: 'multiple-choice';
    prompt: string;
    imageUrl?: string;
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

/* ── Default generated questions ── */

const loremShort = [
    'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
    'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
    'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.',
    'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum.',
    'Excepteur sint occaecat cupidatat non proident, sunt in culpa.',
    'Nulla facilisi morbi tempus iaculis urna id volutpat lacus.',
    'Viverra accumsan in nisl nisi scelerisque eu ultrices vitae.',
    'Amet consectetur adipiscing elit pellentesque habitant morbi tristique.',
    'Feugiat in ante metus dictum at tempor commodo ullamcorper.',
    'Egestas integer eget aliquet nibh praesent tristique magna sit.',
];

const loremLong = [
    'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.',
    'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.',
    'Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Integer feugiat scelerisque varius morbi enim nunc faucibus a pellentesque.',
    'Viverra accumsan in nisl nisi scelerisque eu ultrices vitae auctor. Amet consectetur adipiscing elit pellentesque habitant morbi tristique senectus et netus.',
    'Feugiat in ante metus dictum at tempor commodo ullamcorper a lacus. Egestas integer eget aliquet nibh praesent tristique magna sit amet.',
    'Nulla facilisi morbi tempus iaculis urna id volutpat lacus laoreet. Turpis egestas maecenas pharetra convallis posuere morbi leo urna.',
    'Amet venenatis urna cursus eget nunc scelerisque viverra mauris in. Bibendum ut tristique et egestas quis ipsum suspendisse ultrices gravida.',
    'Risus commodo viverra maecenas accumsan lacus vel facilisis volutpat est. Pretium quam vulputate dignissim suspendisse in est ante in nibh.',
    'Sapien et ligula ullamcorper malesuada proin libero nunc consequat interdum. Ut placerat orci nulla pellentesque dignissim enim sit amet.',
    'Ornare arcu dui vivamus arcu felis bibendum ut tristique. Tortor posuere ac ut consequat semper viverra nam libero justo.',
];

function pick<T>(arr: T[], index: number): T {
    return arr[index % arr.length];
}

export const defaultQuestions: Question[] = Array.from({ length: 50 }, (_, i): Question => {
    const id = i + 1;
    if (id % 5 !== 0 && id % 5 !== 3) {
        return {
            id,
            type: 'multiple-choice',
            prompt: `${id}. ${pick(loremLong, i)}`,
            options: [
                pick(loremShort, i),
                pick(loremShort, i + 1),
                pick(loremShort, i + 2),
                pick(loremShort, i + 3),
            ],
            correctIndex: i % 4,
        };
    }
    return {
        id,
        type: 'essay',
        prompt: `${id}. ${pick(loremLong, i)}`,
    };
});

// Keep backward-compat export
export const questions = defaultQuestions;

/* ── Cloud persistence via verified Appwrite Function ── */

import { ExecutionMethod } from 'appwrite';
import { functions, VERIFY_FUNCTION_ID } from '../services/appwrite';

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 3000;

async function executeWithRetry(body: string): Promise<string | null> {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const result = await functions.createExecution(
                VERIFY_FUNCTION_ID,
                body,
                false,
                undefined,
                ExecutionMethod.POST,
            );
            return result.responseBody || null;
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.warn(`Function call attempt ${attempt}/${MAX_RETRIES} failed: ${msg}`);
            if (attempt < MAX_RETRIES) {
                await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
            }
        }
    }
    return null;
}

export async function loadQuestions(code: string): Promise<TestDataPayload> {
    const responseBody = await executeWithRetry(
        JSON.stringify({ code, action: 'load-questions' }),
    );

    // Default fallback state
    const fallback: TestDataPayload = { settings: {}, questions: defaultQuestions };

    if (responseBody) {
        try {
            const parsed = JSON.parse(responseBody);
            if (parsed.ok && parsed.questions) {
                // Check if the saved data is the new object format { settings, questions }
                // or the old raw array format Question[]
                if (Array.isArray(parsed.questions)) {
                    return { settings: {}, questions: parsed.questions as Question[] };
                } else if (parsed.questions.questions) {
                    return parsed.questions as TestDataPayload;
                }
            }
            // Server returned ok but no questions saved yet
            if (parsed.ok && !parsed.questions) {
                return fallback;
            }
        } catch {
            console.warn('Failed to parse load-questions response');
        }
    }
    // All retries exhausted
    throw new Error('Failed to load questions — server unreachable');
}

export async function saveQuestions(code: string, payload: TestDataPayload): Promise<void> {
    const responseBody = await executeWithRetry(
        // Pass the entire { settings, questions } payload directly into the 'questions' field 
        // expected by the backend to avoid needing to redeploy the function
        JSON.stringify({ code, action: 'save-questions', questions: payload }),
    );
    if (responseBody) {
        const parsed = JSON.parse(responseBody);
        if (!parsed.ok) {
            throw new Error(parsed.error || 'Failed to save questions');
        }
    } else {
        throw new Error('Failed to save — all retries exhausted');
    }
}
