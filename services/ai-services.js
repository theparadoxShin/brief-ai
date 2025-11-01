// AI Service - Encapsulate AI API interactions

export class AIService {
    constructor() {
        this.summarizer = null;
        this.translator = null;
        this.languageDetector = null;
        this.aiSession = null;
        this.capabilities = null;
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
    async translate(text, targetLanguage = 'en', sourceLanguage = null) {
        try {

            if ('Translator' in self) {
            // The Translator API is supported.
                throw new Error('Translator API is not available in this context');
            }

            // Détecter la langue source si non fournie
            if (!sourceLanguage) {
                const detected = await this.detectLanguage(text);
                sourceLanguage = detected.detectedLanguage;
            }

            // Vérifier la disponibilité
            const canTranslate = await window.translation?.canTranslate({
                sourceLanguage,
                targetLanguage
            });

            if (canTranslate === 'no') {
                throw new Error(`Translation from ${sourceLanguage} to ${targetLanguage} is not available`);
            }

            // Créer le translator
            const translator = await window.translation.createTranslator({
                sourceLanguage,
                targetLanguage
            });

            // Attendre le téléchargement si nécessaire
            if (canTranslate === 'after-download') {
                console.log('Downloading translation model...');
                translator.addEventListener('downloadprogress', (e) => {
                    console.log(`Translation model download: ${e.loaded}/${e.total}`);
                });
                await translator.ready;
            }

            // Traduire le texte
            const translatedText = await translator.translate(text);

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
    async detectLanguage(text) {
        try {
            // Vérifier la disponibilité
            const canDetect = await window.translation?.canDetect();

            if (canDetect === 'no') {
                throw new Error('Language detection is not available');
            }

            // Créer le detector si pas déjà fait
            if (!this.languageDetector) {
                this.languageDetector = await window.translation.createDetector();
            }

            // Attendre le téléchargement si nécessaire
            if (canDetect === 'after-download') {
                console.log('Downloading language detection model...');
                await this.languageDetector.ready;
            }

            // Détecter la langue
            const results = await this.languageDetector.detect(text);

            // Trier par confiance
            results.sort((a, b) => b.confidence - a.confidence);

            return {
                detectedLanguage: results[0]?.detectedLanguage,
                confidence: results[0]?.confidence,
                allResults: results,
                text: text.substring(0, 100) + (text.length > 100 ? '...' : '')
            };

        } catch (error) {
            console.error('Language detection error:', error);
            throw new Error(`Language detection failed: ${error.message}`);
        }
    }

    // ===== PROMPT API (Gemini Nano) =====
    async prompt(text, context = null) {
        try {
            // Vérifier la disponibilité
            const canPrompt = await window.ai?.languageModel?.capabilities();

            if (canPrompt?.available === 'no') {
                throw new Error('Prompt API is not available. Make sure you are using Chrome 128+ and have enabled the AI features.');
            }

            // Créer une session si pas déjà fait
            if (!this.aiSession) {
                this.aiSession = await window.ai.languageModel.create({
                    systemPrompt: context || 'You are a helpful AI assistant. Provide clear, concise, and accurate responses.'
                });
            }

            // Attendre le téléchargement si nécessaire
            if (canPrompt?.available === 'after-download') {
                console.log('Downloading AI model...');
                await this.aiSession.ready;
            }

            // Envoyer le prompt
            const response = await this.aiSession.prompt(text);

            return {
                prompt: text,
                response,
                context: context || 'default',
                timestamp: Date.now()
            };

        } catch (error) {
            console.error('Prompt API error:', error);
            throw new Error(`AI prompt failed: ${error.message}`);
        }
    }

    // ===== STREAMING PROMPT (pour de longues réponses) =====
    async promptStream(text, onChunk) {
        try {
            const canPrompt = await window.ai?.languageModel?.capabilities();

            if (canPrompt?.available === 'no') {
                throw new Error('Prompt API is not available');
            }

            if (!this.aiSession) {
                this.aiSession = await window.ai.languageModel.create();
            }

            const stream = await this.aiSession.promptStreaming(text);
            let fullResponse = '';

            for await (const chunk of stream) {
                fullResponse = chunk;
                if (onChunk) {
                    onChunk(chunk);
                }
            }

            return {
                prompt: text,
                response: fullResponse,
                timestamp: Date.now()
            };

        } catch (error) {
            console.error('Streaming prompt error:', error);
            throw new Error(`Streaming prompt failed: ${error.message}`);
        }
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
            // Check Summarizer
            const summarizerCap = await Summarizer;
            status.summarizer = summarizerCap?.availability();

        } catch (error) {
            console.error('Error checking capabilities:', error);
        }

        return status;
    }

}
