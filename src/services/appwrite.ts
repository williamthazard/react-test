import { Client, Functions } from 'appwrite';

const client = new Client()
    .setEndpoint('https://nyc.cloud.appwrite.io/v1')
    .setProject('699de9370020d5f42bdf');

export const functions = new Functions(client);

export const VERIFY_FUNCTION_ID = '699df29119e0c5e74963';
export const SEND_RESULTS_FUNCTION_ID = '699debf48829a77a155d';
