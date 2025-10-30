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
