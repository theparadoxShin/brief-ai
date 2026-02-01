// AI Service - Encapsulate AI API interactions

export class AIService {
    constructor() {
        this.summarizer = null;
        this.summarizerConfig = null; // Track summarizer config to detect changes
        this.translator = null;
        this.languageDetector = null;
        this.aiSession = null;
        this.multimodalSession = null; // Session for image/audio processing
        this.capabilities = null;
        this.translatorPair = null; // { source: 'en', target: 'fr' }
        this.conversationHistory = []; // Track conversation for context
        this.vertexAI = null; // Vertex AI service (legacy)
        this.firebaseAI = null; // Firebase AI Logic (hybrid mode)
        this.aiMode = 'local'; // 'local' or 'online'
        this.selectedModel = 'gemini-nano'; // Default model
    }

    // ===== VERTEX AI SERVICE =====
    async initVertexAI() {
        const result = await chrome.storage.local.get(['vertexAI', 'selectedModel']);

        if (result.vertexAI && result.vertexAI.connected) {
            this.vertexAI = {
                projectId: result.vertexAI.projectId,
                location: result.vertexAI.location,
                apiKey: result.vertexAI.apiKey,
                model: result.selectedModel || 'gemini-1.5-pro'
            };
            return true;
        }
        return false;
    }

    async callVertexAI(prompt, options = {}) {
        if (!this.vertexAI) {
            const initialized = await this.initVertexAI();
            if (!initialized) {
                throw new Error('Vertex AI not configured. Please connect in settings.');
            }
        }

        const endpoint = `https://${this.vertexAI.location}-aiplatform.googleapis.com/v1/projects/${this.vertexAI.projectId}/locations/${this.vertexAI.location}/publishers/google/models/${this.vertexAI.model}:generateContent`;

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.vertexAI.apiKey}`
            },
            body: JSON.stringify({
                contents: [{
                    role: 'user',
                    parts: [{ text: prompt }]
                }],
                generationConfig: {
                    maxOutputTokens: options.maxTokens || 2048,
                    temperature: options.temperature || 0.7,
                    topP: options.topP || 0.95,
                    topK: options.topK || 40
                }
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'Vertex AI request failed');
        }

        const data = await response.json();
        return data.candidates[0].content.parts[0].text;
    }

    async callVertexAIStream(prompt, onChunk, options = {}) {
        if (!this.vertexAI) {
            const initialized = await this.initVertexAI();
            if (!initialized) {
                throw new Error('Vertex AI not configured. Please connect in settings.');
            }
        }

        const endpoint = `https://${this.vertexAI.location}-aiplatform.googleapis.com/v1/projects/${this.vertexAI.projectId}/locations/${this.vertexAI.location}/publishers/google/models/${this.vertexAI.model}:streamGenerateContent`;

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.vertexAI.apiKey}`
            },
            body: JSON.stringify({
                contents: [{
                    role: 'user',
                    parts: [{ text: prompt }]
                }],
                generationConfig: {
                    maxOutputTokens: options.maxTokens || 2048,
                    temperature: options.temperature || 0.7,
                    topP: options.topP || 0.95,
                    topK: options.topK || 40
                }
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'Vertex AI stream request failed');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullResponse = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n').filter(line => line.trim());

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6));
                        if (data.candidates && data.candidates[0].content) {
                            const text = data.candidates[0].content.parts[0].text;
                            fullResponse += text;
                            if (onChunk) onChunk(fullResponse);
                        }
                    } catch (e) {
                        console.error('Error parsing stream chunk:', e);
                    }
                }
            }
        }

        return fullResponse;
    }

    async setAIMode(mode) {
        this.aiMode = mode;
        await chrome.storage.local.set({ aiMode: mode });
    }

    async getAIMode() {
        const result = await chrome.storage.local.get(['aiMode']);
        this.aiMode = result.aiMode || 'local';
        return this.aiMode;
    }

    // ===== SUMMARIZER API =====
    async summarize(text, options = {}) {
        try {
            console.log('[AI Service] Summarize called with options:', options);
            
            // Validate input
            if (!text || typeof text !== 'string' || text.trim().length === 0) {
                throw new Error('Text to summarize cannot be empty');
            }

            // Verify availability
            if (typeof Summarizer === 'undefined') {
                throw new Error('Summarizer API is not available in this browser. Please use Chrome 121+ with Gemini Nano enabled.');
            }

            const canSummarize = await Summarizer.availability();
            console.log('[AI Service] Summarizer availability:', canSummarize);
            
            if (canSummarize === 'unavailable') {
                throw new Error('Summarizer API is not available. Enable chrome://flags/#summarization-api-for-gemini-nano');
            }

            // Prepare options
            const summaryType = options.type || 'tldr';
            const summaryLength = options.length || 'medium';
            const summaryFormat = options.format || 'plain-text';

            // Build config key to track if options changed
            const configKey = `${summaryType}-${summaryLength}-${summaryFormat}`;

            // Recreate summarizer if options changed or not initialized
            if (!this.summarizer || this.summarizerConfig !== configKey) {
                console.log('[AI Service] Creating new Summarizer with config:', configKey);
                
                // Destroy previous summarizer if exists
                if (this.summarizer) {
                    try {
                        this.summarizer.destroy?.();
                    } catch (e) {
                        console.warn('[AI Service] Failed to destroy old summarizer:', e);
                    }
                    this.summarizer = null;
                }

                // Create new summarizer
                this.summarizer = await Summarizer.create({
                    type: summaryType,
                    format: summaryFormat,
                    length: summaryLength,
                    monitor(m) {
                        console.log('[AI Service] Summarizer model download started...');
                        m.addEventListener('downloadprogress', (e) => {
                            const pct = e.total
                                ? Math.round((e.loaded / e.total) * 100)
                                : Math.round(e.loaded * 100);
                            console.log(`[AI Service] Download progress: ${pct}%`);
                        });
                    }
                });

                this.summarizerConfig = configKey;
                console.log('[AI Service] Summarizer created successfully');
            }

            // Generate the summary
            console.log('[AI Service] Generating summary for text length:', text.length);
            const summary = await this.summarizer.summarize(text);
            console.log('[AI Service] Summary generated, length:', summary?.length);
            
            if (!summary) {
                throw new Error('Summarizer returned empty result');
            }

            return {
                summary,
                originalLength: text.length,
                summaryLength: summary.length,
                compressionRatio: ((1 - summary.length / text.length) * 100).toFixed(1) + '%'
            };

        } catch (error) {
            console.error('[AI Service] Summarization error:', error);
            // Reset summarizer on error to allow retry
            this.summarizer = null;
            this.summarizerConfig = null;
            throw new Error(`Summarization failed: ${error.message}`);
        }
    }

        // ===== TRANSLATOR API =====
    async translate(text, targetLanguage = 'en', sourceLanguage = null, options = {}) {
        try {

            console.log('Translator API called');
            console.log('Target:', targetLanguage, 'Source:', sourceLanguage);

            if ('Translator' in self) {
                // The Translator API is supported.
                console.log('Translator API is supported');
            } else {
                throw new Error('Translator API is not supported in this browser');
            }

            // Detect source language if not provided or set to 'auto'
            if (!sourceLanguage || sourceLanguage === 'auto') {
                console.log('Auto-detecting source language...');
                const detected = await this.detectLanguage(text);
                sourceLanguage = detected.detectedLanguage;
                
                if (!sourceLanguage) {
                    throw new Error('Could not detect source language. Please specify it manually.');
                }
                
                console.log(`Detected source language: ${sourceLanguage}`);
            }

            // Normalize and validate language codes (basic BCP-47 lowercase)
            sourceLanguage = String(sourceLanguage).toLowerCase();
            targetLanguage = String(targetLanguage).toLowerCase();

            if (!sourceLanguage || !targetLanguage) {
                throw new Error('Both source and target languages must be specified');
            }

            // If source and target are identical, short-circuit with a no-op translation
            if (sourceLanguage === targetLanguage) {
                return {
                    originalText: text,
                    translatedText: text,
                    sourceLanguage,
                    targetLanguage,
                    note: 'source-target-identical',
                    timestamp: Date.now()
                };
            }

            // Check availability
            const canTranslate = await Translator.availability({
                sourceLanguage: sourceLanguage,
                targetLanguage: targetLanguage
            });
            console.log(`Translation availability from ${sourceLanguage} to ${targetLanguage}: ${canTranslate}`);

            if (canTranslate === 'unavailable') {
                throw new Error(`Translation from ${sourceLanguage} to ${targetLanguage} is not available`);
            }

            // Recreate translator if pair changed
            const pairKey = `${sourceLanguage}->${targetLanguage}`;
            if (!this.translator || this.translatorPair !== pairKey) {
                this.translator = null;
                this.translatorPair = pairKey;
                // Respect user-activation requirement per Built-in AI docs
                const requireActivation = options.requireActivation !== false; // default true
                const hasActivation = (typeof navigator !== 'undefined' && navigator.userActivation)
                    ? navigator.userActivation.isActive
                    : true; // In some extension contexts, this may be undefined; optimistically allow.

                if (requireActivation && !hasActivation) {
                    const err = new Error('User activation required to initialize Translator. Trigger from a click/tap/keypress.');
                    err.code = 'activation-required';
                    throw err;
                }

                // Create the translator
                this.translator = await Translator.create({
                    sourceLanguage: sourceLanguage,
                    targetLanguage: targetLanguage,
                    monitor(m) {
                        m.addEventListener('downloadprogress', (e) => {
                            const state = e.loaded * 100 === 100 ? 'completed' : 'in progress';
                            console.log(`Downloaded ${e.loaded * 100}% (${state})`);
                        });
                    }
                });
            }

            // Translate the text
            const translatedText = await this.translator.translate(text);

            return {
                originalText: text,
                translatedText,
                sourceLanguage,
                targetLanguage,
                timestamp: Date.now()
            };

        } catch (error) {
            console.error('Translation error:', error);
            throw new Error(`Translation failed: ${error.message}`);
        }
    }

    // ===== STREAMING TRANSLATOR API =====
    async translateStream(text, targetLanguage = 'en', sourceLanguage = null, onChunk, options = {}) {
        try {
            console.log('Streaming Translator API called');
            console.log('Target:', targetLanguage, 'Source:', sourceLanguage);

            if (!('Translator' in self)) {
                throw new Error('Translator API is not supported in this browser');
            }

            // Detect source language if not provided or set to 'auto'
            if (!sourceLanguage || sourceLanguage === 'auto') {
                console.log('Auto-detecting source language...');
                const detected = await this.detectLanguage(text);
                sourceLanguage = detected.detectedLanguage;

                if (!sourceLanguage) {
                    throw new Error('Could not detect source language. Please specify it manually.');
                }

                console.log(`Detected source language: ${sourceLanguage}`);
            }

            // Normalize and validate language codes
            sourceLanguage = String(sourceLanguage).toLowerCase();
            targetLanguage = String(targetLanguage).toLowerCase();

            if (!sourceLanguage || !targetLanguage) {
                throw new Error('Both source and target languages must be specified');
            }

            // If source and target are identical, return original text
            if (sourceLanguage === targetLanguage) {
                if (onChunk) onChunk(text);
                return {
                    originalText: text,
                    translatedText: text,
                    sourceLanguage,
                    targetLanguage,
                    note: 'source-target-identical',
                    timestamp: Date.now()
                };
            }

            // Check availability
            const canTranslate = await Translator.availability({
                sourceLanguage: sourceLanguage,
                targetLanguage: targetLanguage
            });

            if (canTranslate === 'unavailable') {
                throw new Error(`Translation from ${sourceLanguage} to ${targetLanguage} is not available`);
            }

            // Recreate translator if pair changed
            const pairKey = `${sourceLanguage}->${targetLanguage}`;
            if (!this.translator || this.translatorPair !== pairKey) {
                this.translator = null;
                this.translatorPair = pairKey;

                const requireActivation = options.requireActivation !== false;
                const hasActivation = (typeof navigator !== 'undefined' && navigator.userActivation)
                    ? navigator.userActivation.isActive
                    : true;

                if (requireActivation && !hasActivation) {
                    const err = new Error('User activation required to initialize Translator. Trigger from a click/tap/keypress.');
                    err.code = 'activation-required';
                    throw err;
                }

                // Create the translator
                this.translator = await Translator.create({
                    sourceLanguage: sourceLanguage,
                    targetLanguage: targetLanguage,
                    monitor(m) {
                        m.addEventListener('downloadprogress', (e) => {
                            const state = e.loaded * 100 === 100 ? 'completed' : 'in progress';
                            console.log(`Translation model: Downloaded ${e.loaded * 100}% (${state})`);
                        });
                    }
                });
            }

            // Stream the translation
            const stream = await this.translator.translateStreaming(text);
            let fullTranslation = '';

            for await (const chunk of stream) {
                // Concatenate chunks to build full translation
                fullTranslation += chunk;
                console.log('Translation chunk:', chunk, '| Total length:', fullTranslation.length);
                if (onChunk) onChunk(fullTranslation);
            }

            console.log('Translation streaming complete. Final length:', fullTranslation.length);

            return {
                originalText: text,
                translatedText: fullTranslation,
                sourceLanguage,
                targetLanguage,
                timestamp: Date.now()
            };

        } catch (error) {
            console.error('Streaming translation error:', error);
            throw new Error(`Streaming translation failed: ${error.message}`);
        }
    }

    // ===== LANGUAGE DETECTOR API =====
    async detectLanguage(text, options = {}) {
        try {
            // Verify availability
            const canDetect = await LanguageDetector.availability();

            if (canDetect === 'unavailable') {
                throw new Error('Language detection is not available');
            }

            // Create the detector if not already done
            if (!this.languageDetector) {
                // Respect user-activation requirement per Built-in AI docs
                const requireActivation = options.requireActivation !== false; // default true
                const hasActivation = (typeof navigator !== 'undefined' && navigator.userActivation)
                    ? navigator.userActivation.isActive
                    : true; // In some extension contexts, this may be undefined; optimistically allow.

                if (requireActivation && !hasActivation) {
                    const err = new Error('User activation required to initialize Language Detector. Trigger from a click/tap/keypress.');
                    err.code = 'activation-required';
                    throw err;
                }

                this.languageDetector = await LanguageDetector.create({
                    monitor(m) {
                        m.addEventListener('downloadprogress', (e) => {
                        console.log(`Language Detector: Downloaded ${e.loaded * 100}%`);
                        });
                    },
                });
            }

            // Detect language
            const results = await this.languageDetector.detect(text);

            // Sort by confidence
            results.sort((a, b) => b.confidence - a.confidence);

            // Ensure we have at least one result
            if (!results || results.length === 0) {
                throw new Error('Language detection returned no results');
            }

            return {
                detectedLanguage: results[0].detectedLanguage,
                confidence: results[0].confidence,
                allResults: results,
                text: text.substring(0, 100) + (text.length > 100 ? '...' : '')
            };

        } catch (error) {
            console.error('Language detection error:', error);
            throw new Error(`Language detection failed: ${error.message}`);
        }
    }

    // ===== PROMPT API (LanguageModel) =====
    async prompt(text, options = {}) {
        try {
            // Availability
            const available = (typeof LanguageModel !== 'undefined')
                ? await LanguageModel.availability()
                : 'unavailable';

            if (available === 'unavailable') {
                throw new Error('Prompt API is not available');
            }

            // User activation
            const requireActivation = options.requireActivation !== false; // default true
            const hasActivation = (typeof navigator !== 'undefined' && navigator.userActivation)
                ? navigator.userActivation.isActive
                : true;
            if (requireActivation && !hasActivation) {
                const err = new Error('User activation required to initialize LanguageModel. Trigger from a click/tap/keypress.');
                err.code = 'activation-required';
                throw err;
            }

            // Session creation (with monitor)
            if (!this.aiSession) {
                const params = await LanguageModel.params().catch(() => ({}));
                const createOpts = {
                    monitor(m) {
                        m.addEventListener('downloadprogress', (e) => {
                            const pct = e.total
                                ? Math.round((e.loaded / e.total) * 100)
                                : Math.round(e.loaded * 100);
                            console.log(`LanguageModel download: ${pct}%`);
                        });
                    },
                };

                // Allow initial prompts
                if (Array.isArray(options.initialPrompts)) {
                    createOpts.initialPrompts = options.initialPrompts;
                }

                // Configure decode parameters if both provided
                if (typeof options.temperature === 'number' && typeof options.topK === 'number') {
                    createOpts.temperature = options.temperature;
                    createOpts.topK = options.topK;
                }

                if (options.signal) {
                    createOpts.signal = options.signal;
                }

                this.aiSession = await LanguageModel.create(createOpts);
            }

            // Prompt (non-streaming)
            const response = await this.aiSession.prompt(text, {
                responseConstraint: options.responseConstraint,
                signal: options.signal,
            });

            return {
                prompt: text,
                response,
                timestamp: Date.now(),
            };
        } catch (error) {
            console.error('Prompt API error:', error);
            throw new Error(`AI prompt failed: ${error.message}`);
        }
    }

    // ===== STREAMING PROMPT (for long responses) =====
    async promptStream(text, onChunk, options = {}) {
        try {
            // Get current AI mode
            await this.getAIMode();

            // Use Vertex AI if in online mode
            if (this.aiMode === 'online') {
                console.log('Using Vertex AI for streaming...');
                const systemPrompt = 'You are a helpful and friendly AI assistant. IMPORTANT: Always respond in the SAME language as the user\'s message. If the user writes in French, respond in French. If in English, respond in English. Remember the conversation context and provide relevant responses based on previous messages.';

                // Build conversation context
                let contextPrompt = systemPrompt + '\n\nConversation history:\n';
                for (const msg of this.conversationHistory) {
                    contextPrompt += `${msg.role}: ${msg.content}\n`;
                }
                contextPrompt += `user: ${text}\nassistant:`;

                const fullResponse = await this.callVertexAIStream(contextPrompt, onChunk, options);

                // Store conversation in history
                this.conversationHistory.push({
                    role: 'user',
                    content: text
                });
                this.conversationHistory.push({
                    role: 'assistant',
                    content: fullResponse
                });

                return { prompt: text, response: fullResponse, timestamp: Date.now() };
            }

            // Use local Gemini Nano (existing code)
            const available = (typeof LanguageModel !== 'undefined')
                ? await LanguageModel.availability()
                : 'unavailable';
            if (available === 'unavailable') {
                throw new Error('Prompt API is not available');
            }

            const requireActivation = options.requireActivation !== false;
            const hasActivation = (typeof navigator !== 'undefined' && navigator.userActivation)
                ? navigator.userActivation.isActive
                : true;
            if (requireActivation && !hasActivation) {
                const err = new Error('User activation required to initialize LanguageModel. Trigger from a click/tap/keypress.');
                err.code = 'activation-required';
                throw err;
            }

            // Create session only once with system prompt
            if (!this.aiSession) {
                const createOpts = {
                    monitor(m) {
                        m.addEventListener('downloadprogress', (e) => {
                            const pct = e.total
                                ? Math.round((e.loaded / e.total) * 100)
                                : Math.round(e.loaded * 100);
                            console.log(`LanguageModel download: ${pct}%`);
                        });
                    },
                    // Set a helpful system prompt with language instruction
                    initialPrompts: [
                        {
                            role: 'system',
                            content: 'You are a helpful and friendly AI assistant. IMPORTANT: Always respond in the SAME language as the user\'s message. If the user writes in French, respond in French. If in English, respond in English. Remember the conversation context and provide relevant responses based on previous messages.'
                        }
                    ]
                };

                this.aiSession = await LanguageModel.create(createOpts);
            }

            // Prompt with streaming
            const stream = await this.aiSession.promptStreaming(text, { signal: options.signal });
            let fullResponse = '';
            for await (const chunk of stream) {
                // Each chunk is a fragment - concatenate them to build the full response
                fullResponse += chunk;
                console.log('Chunk fragment:', chunk, '| Total length so far:', fullResponse.length);
                if (onChunk) onChunk(fullResponse);
            }

            console.log('Streaming complete. Final response length:', fullResponse.length);

            // Store conversation in history (for tracking, though session already remembers)
            this.conversationHistory.push({
                role: 'user',
                content: text
            });
            this.conversationHistory.push({
                role: 'assistant',
                content: fullResponse
            });

            return { prompt: text, response: fullResponse, timestamp: Date.now() };
        } catch (error) {
            console.error('Streaming prompt error:', error);
            throw new Error(`Streaming prompt failed: ${error.message}`);
        }
    }

    // ===== MULTIMODAL: IMAGE DESCRIPTION =====
    async describeImage(imageUrl, customPrompt = null) {
        try {
            console.log('[AI Service] Describing image:', imageUrl);

            // First, try to use local Gemini Nano multimodal
            if (this.aiMode === 'local') {
                return await this.describeImageLocal(imageUrl, customPrompt);
            } else {
                // Use cloud/Firebase AI Logic for image description
                return await this.describeImageCloud(imageUrl, customPrompt);
            }
        } catch (error) {
            console.error('[AI Service] Image description error:', error);
            throw new Error(`Image description failed: ${error.message}`);
        }
    }

    async describeImageLocal(imageUrl, customPrompt = null) {
        try {
            // Check availability with image input
            const availability = await LanguageModel.availability({
                expectedInputs: [{ type: 'image' }, { type: 'text' }]
            });

            if (availability === 'unavailable') {
                throw new Error('Multimodal AI (image) is not available locally. Try enabling chrome://flags/#prompt-api-for-gemini-nano-multimodal-input');
            }

            // Create multimodal session if needed
            if (!this.multimodalSession) {
                this.multimodalSession = await LanguageModel.create({
                    expectedInputs: [
                        { type: 'text', languages: ['en', 'fr', 'es', 'ja'] },
                        { type: 'image' }
                    ],
                    expectedOutputs: [
                        { type: 'text', languages: ['en', 'fr', 'es'] }
                    ],
                    initialPrompts: [
                        {
                            role: 'system',
                            content: 'You are a helpful AI assistant that can describe images in detail. Respond in the same language as the user prompt. Be descriptive and accurate.'
                        }
                    ],
                    monitor(m) {
                        m.addEventListener('downloadprogress', (e) => {
                            const pct = e.total ? Math.round((e.loaded / e.total) * 100) : Math.round(e.loaded * 100);
                            console.log(`[AI Service] Multimodal model download: ${pct}%`);
                        });
                    }
                });
            }

            // Fetch the image and convert to blob
            const response = await fetch(imageUrl);
            const imageBlob = await response.blob();

            const prompt = customPrompt || 'Describe this image in detail. What do you see? Include colors, objects, people, text, and any other relevant details.';

            // Use multimodal prompt with image
            const result = await this.multimodalSession.prompt([
                {
                    role: 'user',
                    content: [
                        { type: 'text', value: prompt },
                        { type: 'image', value: imageBlob }
                    ]
                }
            ]);

            return {
                description: result,
                imageUrl: imageUrl,
                model: 'gemini-nano-multimodal',
                timestamp: Date.now()
            };
        } catch (error) {
            console.error('[AI Service] Local image description error:', error);
            // Fallback to cloud if local fails
            if (this.vertexAI || this.firebaseAI) {
                console.log('[AI Service] Falling back to cloud for image description');
                return await this.describeImageCloud(imageUrl, customPrompt);
            }
            throw error;
        }
    }

    async describeImageCloud(imageUrl, customPrompt = null) {
        try {
            // Initialize Vertex AI if needed
            if (!this.vertexAI) {
                const initialized = await this.initVertexAI();
                if (!initialized) {
                    throw new Error('Cloud AI not configured. Please sign in and configure Cloud AI in settings.');
                }
            }

            // Fetch image and convert to base64
            const response = await fetch(imageUrl);
            const imageBlob = await response.blob();
            const base64Image = await this.blobToBase64(imageBlob);

            const prompt = customPrompt || 'Describe this image in detail. What do you see? Include colors, objects, people, text, and any other relevant details.';

            // Call Vertex AI with image
            const endpoint = `https://${this.vertexAI.location}-aiplatform.googleapis.com/v1/projects/${this.vertexAI.projectId}/locations/${this.vertexAI.location}/publishers/google/models/${this.vertexAI.model}:generateContent`;

            const apiResponse = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.vertexAI.apiKey}`
                },
                body: JSON.stringify({
                    contents: [{
                        role: 'user',
                        parts: [
                            { text: prompt },
                            {
                                inlineData: {
                                    mimeType: imageBlob.type || 'image/jpeg',
                                    data: base64Image
                                }
                            }
                        ]
                    }],
                    generationConfig: {
                        maxOutputTokens: 2048,
                        temperature: 0.4
                    }
                })
            });

            if (!apiResponse.ok) {
                const errorData = await apiResponse.json();
                throw new Error(errorData.error?.message || 'Cloud image description failed');
            }

            const data = await apiResponse.json();
            const description = data.candidates[0].content.parts[0].text;

            return {
                description: description,
                imageUrl: imageUrl,
                model: this.vertexAI.model,
                timestamp: Date.now()
            };
        } catch (error) {
            console.error('[AI Service] Cloud image description error:', error);
            throw error;
        }
    }

    // Helper: Convert Blob to Base64
    async blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const base64 = reader.result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    // ===== MULTIMODAL PROMPT (text + image) =====
    async promptWithImage(text, imageBlob, onChunk = null) {
        try {
            console.log('[AI Service] Multimodal prompt with image');

            // Check multimodal availability
            const availability = await LanguageModel.availability({
                expectedInputs: [{ type: 'image' }, { type: 'text' }]
            });

            if (availability === 'unavailable') {
                // Fallback to cloud
                if (this.aiMode === 'online' || this.vertexAI) {
                    return await this.promptWithImageCloud(text, imageBlob, onChunk);
                }
                throw new Error('Multimodal AI not available. Enable chrome://flags/#prompt-api-for-gemini-nano-multimodal-input');
            }

            // Create or reuse multimodal session
            if (!this.multimodalSession) {
                this.multimodalSession = await LanguageModel.create({
                    expectedInputs: [
                        { type: 'text', languages: ['en', 'fr', 'es', 'ja'] },
                        { type: 'image' }
                    ],
                    expectedOutputs: [
                        { type: 'text', languages: ['en', 'fr', 'es'] }
                    ],
                    monitor(m) {
                        m.addEventListener('downloadprogress', (e) => {
                            const pct = e.total ? Math.round((e.loaded / e.total) * 100) : Math.round(e.loaded * 100);
                            console.log(`[AI Service] Multimodal model download: ${pct}%`);
                        });
                    }
                });
            }

            // Stream response if callback provided
            if (onChunk) {
                const stream = await this.multimodalSession.promptStreaming([
                    {
                        role: 'user',
                        content: [
                            { type: 'text', value: text },
                            { type: 'image', value: imageBlob }
                        ]
                    }
                ]);

                let fullResponse = '';
                for await (const chunk of stream) {
                    fullResponse += chunk;
                    onChunk(fullResponse);
                }

                return { prompt: text, response: fullResponse, timestamp: Date.now() };
            }

            // Non-streaming
            const result = await this.multimodalSession.prompt([
                {
                    role: 'user',
                    content: [
                        { type: 'text', value: text },
                        { type: 'image', value: imageBlob }
                    ]
                }
            ]);

            return { prompt: text, response: result, timestamp: Date.now() };
        } catch (error) {
            console.error('[AI Service] Multimodal prompt error:', error);
            throw new Error(`Multimodal prompt failed: ${error.message}`);
        }
    }

    async promptWithImageCloud(text, imageBlob, onChunk = null) {
        // Use Vertex AI for cloud multimodal
        if (!this.vertexAI) {
            await this.initVertexAI();
        }
        
        if (!this.vertexAI) {
            throw new Error('Cloud AI not configured');
        }

        const base64Image = await this.blobToBase64(imageBlob);
        const prompt = text;

        const endpoint = `https://${this.vertexAI.location}-aiplatform.googleapis.com/v1/projects/${this.vertexAI.projectId}/locations/${this.vertexAI.location}/publishers/google/models/${this.vertexAI.model}:${onChunk ? 'streamGenerateContent' : 'generateContent'}`;

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.vertexAI.apiKey}`
            },
            body: JSON.stringify({
                contents: [{
                    role: 'user',
                    parts: [
                        { text: prompt },
                        {
                            inlineData: {
                                mimeType: imageBlob.type || 'image/jpeg',
                                data: base64Image
                            }
                        }
                    ]
                }],
                generationConfig: {
                    maxOutputTokens: 2048,
                    temperature: 0.7
                }
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'Cloud multimodal request failed');
        }

        if (onChunk) {
            // Stream response
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullResponse = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n').filter(line => line.trim());

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
                                fullResponse += data.candidates[0].content.parts[0].text;
                                onChunk(fullResponse);
                            }
                        } catch (e) { /* ignore parse errors */ }
                    }
                }
            }

            return { prompt: text, response: fullResponse, timestamp: Date.now() };
        }

        const data = await response.json();
        return {
            prompt: text,
            response: data.candidates[0].content.parts[0].text,
            timestamp: Date.now()
        };
    }

    // Reset chat session (useful for "New Chat" feature)
    resetChatSession() {
        if (this.aiSession) {
            this.aiSession.destroy();
            this.aiSession = null;
        }
        if (this.multimodalSession) {
            this.multimodalSession.destroy();
            this.multimodalSession = null;
        }
        this.conversationHistory = [];
        console.log('Chat session reset');
    }

    // ===== CHECKING AVAILABILITY =====
    async checkAvailability() {
        const status = {
            summarizer: 'checking',
            translator: 'checking',
            languageDetector: 'checking',
            promptAPI: 'checking'
        };

        try {
            // Check Summarizer API
            if (typeof Summarizer !== 'undefined') {
                status.summarizer = await Summarizer.availability();
            } else {
                status.summarizer = 'unavailable';
            }

            // Check Translator API
            // Translator requires language pair, so we check with common pair (en->fr)
            if (typeof Translator !== 'undefined') {
                try {
                    status.translator = await Translator.availability({
                        sourceLanguage: 'en',
                        targetLanguage: 'fr'
                    });
                } catch (e) {
                    status.translator = 'unavailable';
                }
            } else {
                status.translator = 'unavailable';
            }

            // Check Language Detector API
            if (typeof LanguageDetector !== 'undefined') {
                status.languageDetector = await LanguageDetector.availability();
            } else {
                status.languageDetector = 'unavailable';
            }

            // Check Prompt API (LanguageModel)
            if (typeof LanguageModel !== 'undefined') {
                status.promptAPI = await LanguageModel.availability();
            } else {
                status.promptAPI = 'unavailable';
            }

        } catch (error) {
            console.error('Error checking AI capabilities:', error);
        }

        return status;
    }

}
