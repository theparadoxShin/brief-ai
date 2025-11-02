// AI Service - Encapsulate AI API interactions

export class AIService {
    constructor() {
        this.summarizer = null;
        this.translator = null;
        this.languageDetector = null;
        this.aiSession = null;
        this.capabilities = null;
        this.translatorPair = null; // { source: 'en', target: 'fr' }
        this.conversationHistory = []; // Track conversation for context
    }

    // ===== SUMMARIZER API =====
    /**
     * Summarize text using Chrome's built-in Summarizer API.
     * Options:
     *  - type: 'tldr' | 'key-points' | 'teaser' | 'headline'
     *  - format: 'plain-text' | 'markdown'
     *  - length: 'short' | 'medium' | 'long'
     *  - requireActivation: boolean (default: true) — when true, ensures a user gesture is present before creating the model
     */
    async summarize(text, options = {}) {
        try {
            // Verify availability
            const canSummarize = await Summarizer.availability();
            
            if (canSummarize === 'unavailable') {
                throw new Error('Summarizer API is not available');
            }

            // Create the summarizer if not already done
            if (!this.summarizer) {
                // Respect user-activation requirement per Built-in AI docs
                const requireActivation = options.requireActivation !== false; // default true
                const hasActivation = (typeof navigator !== 'undefined' && navigator.userActivation)
                    ? navigator.userActivation.isActive
                    : true; // In some extension contexts, this may be undefined; optimistically allow.

                if (requireActivation && !hasActivation) {
                    const err = new Error('User activation required to initialize Summarizer. Trigger from a click/tap/keypress.');
                    err.code = 'activation-required';
                    throw err;
                }

                this.summarizer = await Summarizer.create({
                    type: options.type || 'tldr', // 'tldr', 'key-points', 'teaser', 'headline'
                    format: options.format || 'plain-text', // 'plain-text' or 'markdown'
                    length: options.length || 'medium', // 'short', 'medium', 'long'
                    monitor(m) {
                        console.log('Downloading summarizer model...');
                        m.addEventListener('downloadprogress', (e) => {
                            const pct = e.total
                                ? Math.round((e.loaded / e.total) * 100)
                                : Math.round(e.loaded * 100);
                            console.log(`Download progress: ${pct}%`);
                        });
                    }
                });
            }
            // Generate the summary
            const summary = await this.summarizer.summarize(text);
            
            return {
                summary,
                originalLength: text.length,
                summaryLength: summary.length,
                compressionRatio: ((1 - summary.length / text.length) * 100).toFixed(1) + '%'
            };

        } catch (error) {
            console.error('Summarization error:', error);
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
    /**
     * Prompt the built-in language model.
     * options:
     *  - requireActivation: boolean (default true)
     *  - initialPrompts: Array<{role:'system'|'user'|'assistant', content:string}>
     *  - temperature?: number
     *  - topK?: number
     *  - responseConstraint?: any (JSON Schema)
     *  - signal?: AbortSignal
     */
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

    // Reset chat session (useful for "New Chat" feature)
    resetChatSession() {
        if (this.aiSession) {
            this.aiSession.destroy();
            this.aiSession = null;
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
