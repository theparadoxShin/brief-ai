// Firebase Configuration
// NOTE: Replace these values with your actual Firebase project credentials
// Get these from Firebase Console > Project Settings > General > Your apps

export const firebaseConfig = {
    // TODO: Replace with your Firebase project credentials
    apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    authDomain: "brief-ai-xxxxx.firebaseapp.com",
    projectId: "brief-ai-xxxxx",
    storageBucket: "brief-ai-xxxxx.appspot.com",
    messagingSenderId: "123456789012",
    appId: "1:123456789012:web:abcdef123456",
    measurementId: "G-XXXXXXXXXX"
};

// Firebase Cloud Functions URL
// Update this after deploying your functions
export const functionsURL = "https://us-central1-brief-ai-xxxxx.cloudfunctions.net";

// Available functions endpoints
export const FUNCTIONS = {
    SUMMARIZE: "summarizeText",
    TRANSLATE: "translateText",
    CHAT: "chatWithAI",
    GET_USER_INFO: "getUserInfo"
};
