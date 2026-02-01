// Brief AI - Firebase Cloud Functions
// This handles all Cloud AI requests with Vertex AI

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { VertexAI } = require('@google-cloud/vertexai');
const admin = require('firebase-admin');

// Initialize Firebase Admin
admin.initializeApp();

// Vertex AI Configuration (auto-configured on Firebase)
const project = process.env.GCLOUD_PROJECT;
const location = 'us-central1'; // Or 'europe-west1' for EU
const vertex_ai = new VertexAI({ project: project, location: location });

// ===== HELPER FUNCTIONS =====

/**
 * Get Vertex AI model based on user's subscription
 */
function getModel(subscription = 'free') {
    const modelMap = {
        'free': 'gemini-1.5-flash',    // Fast and cheap
        'pro': 'gemini-1.5-pro',        // More powerful
        'team': 'gemini-1.5-pro'        // Same as pro
    };

    const modelName = modelMap[subscription] || 'gemini-1.5-flash';
    return vertex_ai.preview.getGenerativeModel({ model: modelName });
}

/**
 * Check user's subscription and rate limits
 */
async function checkUserAccess(userId, action) {
    const userDoc = await admin.firestore().collection('users').doc(userId).get();

    if (!userDoc.exists) {
        // Create new user document
        await admin.firestore().collection('users').doc(userId).set({
            subscription: 'free',
            requestsToday: 0,
            lastReset: admin.firestore.FieldValue.serverTimestamp(),
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        return { allowed: true, subscription: 'free', remaining: 50 };
    }

    const userData = userDoc.data();
    const subscription = userData.subscription || 'free';

    // Reset daily counter if needed
    const lastReset = userData.lastReset?.toDate();
    const now = new Date();
    if (!lastReset || now.getDate() !== lastReset.getDate()) {
        await admin.firestore().collection('users').doc(userId).update({
            requestsToday: 0,
            lastReset: admin.firestore.FieldValue.serverTimestamp()
        });
        userData.requestsToday = 0;
    }

    // Check rate limits
    const limits = {
        'free': 50,
        'pro': Infinity,
        'team': Infinity
    };

    const limit = limits[subscription] || 50;
    const used = userData.requestsToday || 0;

    if (used >= limit) {
        return { allowed: false, subscription, remaining: 0 };
    }

    return { allowed: true, subscription, remaining: limit - used };
}

/**
 * Log usage to Firestore
 */
async function logUsage(userId, action, inputLength, outputLength, model) {
    await admin.firestore().collection('usage').add({
        userId,
        action,
        inputLength,
        outputLength,
        model,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    // Increment user's request counter
    await admin.firestore().collection('users').doc(userId).update({
        requestsToday: admin.firestore.FieldValue.increment(1)
    });
}

// ===== CLOUD FUNCTIONS =====

/**
 * Summarize text using Vertex AI
 */
exports.summarizeText = onCall({ cors: true }, async (request) => {
    // Check authentication
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'You must be signed in to use Cloud AI');
    }

    const userId = request.auth.uid;
    const { text, type = 'tldr', length = 'medium' } = request.data;

    if (!text) {
        throw new HttpsError('invalid-argument', 'Text is required');
    }

    try {
        // Check access and rate limits
        const access = await checkUserAccess(userId, 'summarize');
        if (!access.allowed) {
            throw new HttpsError('resource-exhausted',
                'Daily limit reached. Upgrade to Pro for unlimited requests.');
        }

        // Get appropriate model
        const model = getModel(access.subscription);

        // Build prompt
        const typeDescriptions = {
            'tldr': 'TL;DR style summary',
            'key-points': 'key points in bullet format',
            'teaser': 'engaging teaser',
            'headline': 'catchy headline'
        };

        const lengthDescriptions = {
            'short': 'very brief (1-2 sentences)',
            'medium': 'concise (3-4 sentences)',
            'long': 'detailed (5-6 sentences)'
        };

        const prompt = `Create a ${lengthDescriptions[length]} ${typeDescriptions[type]} of the following text:\n\n${text}`;

        // Call Vertex AI
        const result = await model.generateContent(prompt);
        const response = result.response;
        const summary = response.candidates[0].content.parts[0].text;

        // Log usage
        await logUsage(userId, 'summarize', text.length, summary.length, access.subscription);

        return {
            success: true,
            summary,
            originalLength: text.length,
            summaryLength: summary.length,
            provider: 'vertex-ai',
            model: access.subscription,
            remaining: access.remaining - 1
        };

    } catch (error) {
        console.error('Summarize error:', error);
        throw new HttpsError('internal', `Failed to summarize: ${error.message}`);
    }
});

/**
 * Translate text using Vertex AI
 */
exports.translateText = onCall({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'You must be signed in to use Cloud AI');
    }

    const userId = request.auth.uid;
    const { text, targetLanguage, sourceLanguage = 'auto' } = request.data;

    if (!text || !targetLanguage) {
        throw new HttpsError('invalid-argument', 'Text and target language are required');
    }

    try {
        const access = await checkUserAccess(userId, 'translate');
        if (!access.allowed) {
            throw new HttpsError('resource-exhausted',
                'Daily limit reached. Upgrade to Pro for unlimited requests.');
        }

        const model = getModel(access.subscription);

        const prompt = sourceLanguage === 'auto'
            ? `Translate this text to ${targetLanguage}:\n\n${text}`
            : `Translate this text from ${sourceLanguage} to ${targetLanguage}:\n\n${text}`;

        const result = await model.generateContent(prompt);
        const response = result.response;
        const translatedText = response.candidates[0].content.parts[0].text;

        await logUsage(userId, 'translate', text.length, translatedText.length, access.subscription);

        return {
            success: true,
            translatedText,
            sourceLanguage,
            targetLanguage,
            provider: 'vertex-ai',
            remaining: access.remaining - 1
        };

    } catch (error) {
        console.error('Translate error:', error);
        throw new HttpsError('internal', `Failed to translate: ${error.message}`);
    }
});

/**
 * AI Chat with context using Vertex AI (Streaming)
 */
exports.chatWithAI = onCall({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'You must be signed in to use Cloud AI');
    }

    const userId = request.auth.uid;
    const { message, context = [] } = request.data;

    if (!message) {
        throw new HttpsError('invalid-argument', 'Message is required');
    }

    try {
        const access = await checkUserAccess(userId, 'chat');
        if (!access.allowed) {
            throw new HttpsError('resource-exhausted',
                'Daily limit reached. Upgrade to Pro for unlimited requests.');
        }

        const model = getModel(access.subscription);

        // System prompt
        const systemPrompt = 'You are a helpful and friendly AI assistant. IMPORTANT: Always respond in the SAME language as the user\'s message. Remember the conversation context and provide relevant responses based on previous messages.';

        // Build conversation history
        let fullPrompt = systemPrompt + '\n\nConversation history:\n';
        for (const msg of context) {
            fullPrompt += `${msg.role}: ${msg.content}\n`;
        }
        fullPrompt += `user: ${message}\nassistant:`;

        // Call Vertex AI
        const result = await model.generateContent(fullPrompt);
        const response = result.response;
        const aiResponse = response.candidates[0].content.parts[0].text;

        await logUsage(userId, 'chat', message.length, aiResponse.length, access.subscription);

        return {
            success: true,
            response: aiResponse,
            provider: 'vertex-ai',
            remaining: access.remaining - 1
        };

    } catch (error) {
        console.error('Chat error:', error);
        throw new HttpsError('internal', `Failed to chat: ${error.message}`);
    }
});

/**
 * Get user's subscription info and remaining requests
 */
exports.getUserInfo = onCall({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'You must be signed in');
    }

    const userId = request.auth.uid;

    try {
        const userDoc = await admin.firestore().collection('users').doc(userId).get();

        if (!userDoc.exists) {
            return {
                subscription: 'free',
                requestsToday: 0,
                remaining: 50
            };
        }

        const userData = userDoc.data();
        const subscription = userData.subscription || 'free';
        const requestsToday = userData.requestsToday || 0;

        const limits = {
            'free': 50,
            'pro': Infinity,
            'team': Infinity
        };

        const limit = limits[subscription];
        const remaining = limit === Infinity ? Infinity : Math.max(0, limit - requestsToday);

        return {
            subscription,
            requestsToday,
            remaining,
            limit: limit === Infinity ? 'unlimited' : limit
        };

    } catch (error) {
        console.error('Get user info error:', error);
        throw new HttpsError('internal', 'Failed to get user info');
    }
});
