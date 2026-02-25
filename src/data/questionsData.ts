

export type MultipleChoiceQuestion = {
    id: number;
    type: 'multiple-choice';
    prompt: string;
    options: string[];
    correctIndex: number;
};

export type MultipleAnswerQuestion = {
    id: number;
    type: 'multiple-answer';
    prompt: string;
    options: string[];
    correctIndices: number[];
};

export type EssayQuestion = {
    id: number;
    type: 'essay';
    prompt: string;
};

export type Question = MultipleChoiceQuestion | MultipleAnswerQuestion | EssayQuestion;

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

/* ── Cloud persistence via Appwrite Web SDK ── */

import { databases } from '../services/appwrite';
import { Query, ID } from 'appwrite';

const DATABASE_ID = 'test-app-db';
const COLLECTION_ID = 'questions';

export async function loadQuestions(): Promise<Question[]> {
    try {
        const result = await databases.listDocuments(DATABASE_ID, COLLECTION_ID, [
            Query.limit(1),
        ]);
        if (result.documents.length > 0) {
            const doc = result.documents[0];
            const parsed = JSON.parse(doc.data);
            return parsed as Question[];
        }
    } catch (e) {
        console.warn('Failed to load questions from cloud, using defaults', e);
    }
    return defaultQuestions;
}

export async function saveQuestions(questionsToSave: Question[]): Promise<void> {
    const dataStr = JSON.stringify(questionsToSave);

    try {
        const result = await databases.listDocuments(DATABASE_ID, COLLECTION_ID, [
            Query.limit(1),
        ]);

        if (result.documents.length > 0) {
            // Update existing document
            await databases.updateDocument(DATABASE_ID, COLLECTION_ID, result.documents[0].$id, {
                data: dataStr,
            });
        } else {
            // Create new document
            await databases.createDocument(DATABASE_ID, COLLECTION_ID, ID.unique(), {
                data: dataStr,
            });
        }
    } catch (e) {
        console.error('Failed to save questions:', e);
        throw e;
    }
}

