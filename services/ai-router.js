// AI Router - Smart routing between Local AI and Cloud AI
// Automatically chooses the best provider based on availability, user preference, and network

import { AIService } from './ai-services.js';
import { cloudAIService } from './cloud-ai-service.js';
import { firebaseAuth } from './firebase-auth.js';

class AIRouter {
    constructor() {
        this.localAI = new AIService();
        this.cloudAI = cloudAIService;
        this.preferredMode = 'local'; // 'local', 'cloud', or 'auto'
        this.conversationHistory = []; // For chat context
    }

    // Initialize and load preferences
    async initialize() {
        const result = await chrome.storage.local.get(['aiMode']);
        this.preferredMode = result.aiMode || 'local';
    }

    // Set AI mode
    async setMode(mode) {
        this.preferredMode = mode;
        await chrome.storage.local.set({ aiMode: mode });
        console.log(`AI Router mode set to: ${mode}`);
    }

    // Get current mode
    getMode() {
        return this.preferredMode;
    }

    // Determine which provider to use
    async selectProvider(action, text = '') {
        await this.initialize();

        // If user explicitly chose cloud and is authenticated
        if (this.preferredMode === 'cloud') {
            const hasCloudAccess = await this.cloudAI.hasCloudAccess();
            if (hasCloudAccess) {
                return 'cloud';
            } else {
                console.warn('Cloud AI selected but user not authenticated. Falling back to local.');
                return 'local';
            }
        }

        // If user explicitly chose local
        if (this.preferredMode === 'local') {
            return 'local';
        }

        // Auto mode - smart selection
        if (this.preferredMode === 'auto') {
            // Check local availability first
            const localAvailable = await this.isLocalAvailable(action);

            // Check text length (local has limits)
            const textLength = text.length;
            const LOCAL_MAX_LENGTH = 10000;

            // If local can handle it, prefer local (faster, private, free)
            if (localAvailable && textLength < LOCAL_MAX_LENGTH) {
                return 'local';
            }

            // Check if cloud is available
            const hasCloudAccess = await this.cloudAI.hasCloudAccess();
            const isOnline = navigator.onLine;

            if (hasCloudAccess && isOnline) {
                return 'cloud';
            }

            // Fallback to local if available
            if (localAvailable) {
                return 'local';
            }

            throw new Error('No AI provider available. Please check your connection or enable Local AI.');
        }

        return 'local'; // Default fallback
    }

    // Check if local AI is available for specific action
    async isLocalAvailable(action) {
        try {
            const availability = await this.localAI.checkAvailability();

            switch (action) {
                case 'summarize':
                    return availability.summarizer === 'available';
                case 'translate':
                    return availability.translator === 'available';
                case 'detect':
                    return availability.languageDetector === 'available';
                case 'prompt':
                case 'chat':
                    return availability.languageModel === 'available';
                default:
                    return false;
            }
        } catch (error) {
            console.error('Error checking local availability:', error);
            return false;
        }
    }

    // SUMMARIZE with smart routing
    async summarize(text, options = {}) {
        const provider = await this.selectProvider('summarize', text);

        try {
            if (provider === 'cloud') {
                console.log('Using Cloud AI for summarization');
                return await this.cloudAI.summarize(text, options);
            } else {
                console.log('Using Local AI for summarization');
                return await this.localAI.summarize(text, options);
            }
        } catch (error) {
            // Try fallback
            console.warn(`${provider} AI failed, trying fallback:`, error);
            return await this.fallback('summarize', text, options, provider);
        }
    }

    // TRANSLATE with smart routing
    async translate(text, targetLanguage, sourceLanguage = 'auto', options = {}) {
        const provider = await this.selectProvider('translate', text);

        try {
            if (provider === 'cloud') {
                console.log('Using Cloud AI for translation');
                return await this.cloudAI.translate(text, targetLanguage, sourceLanguage);
            } else {
                console.log('Using Local AI for translation');
                return await this.localAI.translate(text, targetLanguage, sourceLanguage, options);
            }
        } catch (error) {
            console.warn(`${provider} AI failed, trying fallback:`, error);
            return await this.fallback('translate', { text, targetLanguage, sourceLanguage, options }, null, provider);
        }
    }

    // TRANSLATE STREAM with smart routing
    async translateStream(text, targetLanguage, sourceLanguage, onChunk, options = {}) {
        const provider = await this.selectProvider('translate', text);

        try {
            if (provider === 'cloud') {
                console.log('Using Cloud AI for streaming translation');
                return await this.cloudAI.translateStream(text, targetLanguage, sourceLanguage, onChunk, options);
            } else {
                console.log('Using Local AI for streaming translation');
                return await this.localAI.translateStream(text, targetLanguage, sourceLanguage, onChunk, options);
            }
        } catch (error) {
            console.warn(`${provider} AI failed for streaming translation:`, error);
            throw error;
        }
    }

    // CHAT with smart routing
    async chat(message, options = {}) {
        const provider = await this.selectProvider('chat', message);

        try {
            if (provider === 'cloud') {
                console.log('Using Cloud AI for chat');
                const result = await this.cloudAI.chat(message, this.conversationHistory);

                // Update history
                this.conversationHistory.push(
                    { role: 'user', content: message },
                    { role: 'assistant', content: result.response }
                );

                return result;
            } else {
                console.log('Using Local AI for chat');
                // Local AI manages its own history internally
                return await this.localAI.prompt(message, options);
            }
        } catch (error) {
            console.warn(`${provider} AI failed for chat:`, error);
            return await this.fallback('chat', message, options, provider);
        }
    }

    // CHAT STREAM with smart routing
    async chatStream(message, onChunk, options = {}) {
        const provider = await this.selectProvider('chat', message);

        try {
            if (provider === 'cloud') {
                console.log('Using Cloud AI for streaming chat');
                const result = await this.cloudAI.chatStream(message, this.conversationHistory, onChunk, options);

                // Update history
                this.conversationHistory.push(
                    { role: 'user', content: message },
                    { role: 'assistant', content: result.response }
                );

                return result;
            } else {
                console.log('Using Local AI for streaming chat');
                return await this.localAI.promptStream(message, onChunk, options);
            }
        } catch (error) {
            console.warn(`${provider} AI failed for streaming chat:`, error);
            throw error;
        }
    }

    // DETECT LANGUAGE
    async detectLanguage(text) {
        // Language detection is only available locally
        return await this.localAI.detectLanguage(text);
    }

    // RESET CHAT SESSION
    resetChatSession() {
        this.conversationHistory = [];
        this.localAI.resetChatSession();
        console.log('Chat session reset');
    }

    // Fallback strategy
    async fallback(action, data, options, failedProvider) {
        const alternateProvider = failedProvider === 'cloud' ? 'local' : 'cloud';

        console.log(`Attempting fallback to ${alternateProvider} AI`);

        if (alternateProvider === 'cloud') {
            const hasCloudAccess = await this.cloudAI.hasCloudAccess();
            if (!hasCloudAccess) {
                throw new Error('Cloud AI not available and local AI failed');
            }

            switch (action) {
                case 'summarize':
                    return await this.cloudAI.summarize(data, options);
                case 'translate':
                    return await this.cloudAI.translate(data.text, data.targetLanguage, data.sourceLanguage);
                case 'chat':
                    return await this.cloudAI.chat(data, options);
                default:
                    throw new Error(`No fallback available for action: ${action}`);
            }
        } else {
            // Fallback to local
            const available = await this.isLocalAvailable(action);
            if (!available) {
                throw new Error('Local AI not available and cloud AI failed');
            }

            switch (action) {
                case 'summarize':
                    return await this.localAI.summarize(data, options);
                case 'translate':
                    return await this.localAI.translate(data.text, data.targetLanguage, data.sourceLanguage, data.options);
                case 'chat':
                    return await this.localAI.prompt(data, options);
                default:
                    throw new Error(`No fallback available for action: ${action}`);
            }
        }
    }

    // Get provider info
    async getProviderInfo() {
        const provider = await this.selectProvider('chat');
        const isAuthenticated = await firebaseAuth.isAuthenticated();

        let userInfo = null;
        if (provider === 'cloud' && isAuthenticated) {
            try {
                userInfo = await this.cloudAI.getUserInfo();
            } catch (error) {
                console.error('Failed to get user info:', error);
            }
        }

        return {
            currentProvider: provider,
            preferredMode: this.preferredMode,
            isAuthenticated,
            userInfo
        };
    }
}

// Export singleton instance
export const aiRouter = new AIRouter();
