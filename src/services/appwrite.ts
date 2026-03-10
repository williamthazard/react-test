import { Client, Functions, Databases } from 'appwrite';

const client = new Client()
    .setEndpoint('https://nyc.cloud.appwrite.io/v1')
    .setProject(import.meta.env.VITE_APPWRITE_PROJECT_ID);

export const functions = new Functions(client);
export const databases = new Databases(client);

export const VERIFY_FUNCTION_ID = 'verify-access-code';
export const SEND_RESULTS_FUNCTION_ID = import.meta.env.VITE_SEND_RESULTS_FUNCTION_ID;
export const MANAGE_QUESTIONS_FUNCTION_ID = 'manage-questions';
