// Cloud AI Service
// Calls Firebase Cloud Functions for powerful cloud AI features

import { firebaseAuth } from './firebase-auth.js';
import { firebaseConfig } from '../config/firebase-config.js';

class CloudAIService {
    constructor() {
        this.functions = null;
        this.initialized = false;
    }

    // Initialize Firebase Functions
    async initialize() {
        if (this.initialized) return;

        try {
            const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js');
            const { getFunctions, httpsCallable } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js');

            const app = initializeApp(firebaseConfig);
            this.functions = getFunctions(app);
            this.httpsCallable = httpsCallable;

            this.initialized = true;
            console.log('Cloud AI Service initialized');

        } catch (error) {
            console.error('Cloud AI initialization error:', error);
            throw error;
        }
    }

    // Check if user has cloud access
    async hasCloudAccess() {
        return await firebaseAuth.isAuthenticated();
    }

    // Call Firebase Function
    async callFunction(functionName, data) {
        await this.initialize();

        // Check authentication
        if (!await this.hasCloudAccess()) {
            throw new Error('Cloud AI requires authentication. Please sign in.');
        }

        try {
            const callable = this.httpsCallable(this.functions, functionName);
            const result = await callable(data);
            return result.data;

        } catch (error) {
            console.error(`Cloud function ${functionName} error:`, error);

            // Handle specific errors
            if (error.code === 'unauthenticated') {
                throw new Error('Authentication required. Please sign in.');
            } else if (error.code === 'resource-exhausted') {
                throw new Error('Daily limit reached. Upgrade to Pro for unlimited requests.');
            } else if (error.code === 'permission-denied') {
                throw new Error('Permission denied. Check your subscription.');
            }

            throw new Error(`Cloud AI error: ${error.message}`);
        }
    }

    // Summarize text using Cloud AI
    async summarize(text, options = {}) {
        const result = await this.callFunction('summarizeText', {
            text,
            type: options.type || 'tldr',
            length: options.length || 'medium'
        });

        return {
            summary: result.summary,
            originalLength: result.originalLength,
            summaryLength: result.summaryLength,
            provider: 'cloud-ai',
            remaining: result.remaining
        };
    }

    // Translate text using Cloud AI
    async translate(text, targetLanguage, sourceLanguage = 'auto') {
        const result = await this.callFunction('translateText', {
            text,
            targetLanguage,
            sourceLanguage
        });

        return {
            translatedText: result.translatedText,
            sourceLanguage: result.sourceLanguage,
            targetLanguage: result.targetLanguage,
            provider: 'cloud-ai',
            remaining: result.remaining
        };
    }

    // Chat with AI using Cloud AI
    async chat(message, context = []) {
        const result = await this.callFunction('chatWithAI', {
            message,
            context
        });

        return {
            response: result.response,
            provider: 'cloud-ai',
            remaining: result.remaining
        };
    }

    // Get user info and remaining requests
    async getUserInfo() {
        const result = await this.callFunction('getUserInfo', {});
        return result;
    }

    // Stream translation (chunked updates)
    async translateStream(text, targetLanguage, sourceLanguage, onChunk, options = {}) {
        // For now, use non-streaming and simulate chunks
        // TODO: Implement true streaming with Firebase when available
        const result = await this.translate(text, targetLanguage, sourceLanguage);

        // Simulate streaming by sending chunks
        const translatedText = result.translatedText;
        const chunkSize = Math.ceil(translatedText.length / 10);

        for (let i = 0; i < translatedText.length; i += chunkSize) {
            const chunk = translatedText.substring(0, i + chunkSize);
            if (onChunk) onChunk(chunk);
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        return result;
    }

    // Stream chat (chunked updates)
    async chatStream(message, context, onChunk, options = {}) {
        // For now, use non-streaming and simulate chunks
        // TODO: Implement true streaming with Firebase when available
        const result = await this.chat(message, context);

        // Simulate streaming by sending chunks
        const response = result.response;
        const chunkSize = Math.ceil(response.length / 15);

        for (let i = 0; i < response.length; i += chunkSize) {
            const chunk = response.substring(0, i + chunkSize);
            if (onChunk) onChunk(chunk);
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        return result;
    }
}

// Export singleton instance
export const cloudAIService = new CloudAIService();
