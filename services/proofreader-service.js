// Proofreader Service - Chrome's Built-in Proofreader API (Gemini Nano)
// Helps users fix spelling and grammar mistakes

export class ProofreaderService {
    constructor() {
        this.proofreader = null;
        this.currentLanguage = 'en';
        this.isAvailable = false;
    }

    /**
     * Check if Proofreader API is available
     * @returns {Promise<{available: boolean, status: string}>}
     */
    async checkAvailability() {
        try {
            if (typeof Proofreader === 'undefined') {
                return {
                    available: false,
                    status: 'unavailable',
                    message: 'Proofreader API is not available. Enable chrome://flags/#proofreader-api-for-gemini-nano'
                };
            }

            const availability = await Proofreader.availability();
            console.log('[Proofreader] Availability:', availability);

            this.isAvailable = availability === 'available' || availability === 'downloadable';

            return {
                available: this.isAvailable,
                status: availability,
                message: this.getStatusMessage(availability)
            };
        } catch (error) {
            console.error('[Proofreader] Error checking availability:', error);
            return {
                available: false,
                status: 'error',
                message: error.message
            };
        }
    }

    /**
     * Get human-readable status message
     */
    getStatusMessage(status) {
        switch (status) {
            case 'available':
                return 'Proofreader is ready to use';
            case 'downloadable':
                return 'Proofreader model needs to be downloaded';
            case 'downloading':
                return 'Proofreader model is downloading...';
            case 'unavailable':
                return 'Proofreader is not available. Enable it in chrome://flags';
            default:
                return `Unknown status: ${status}`;
        }
    }

    /**
     * Initialize the proofreader with specified language
     * @param {string} language - Expected input language (e.g., 'en', 'fr')
     * @param {function} onProgress - Download progress callback
     */
    async initialize(language = 'en', onProgress = null) {
        try {
            // Check availability first
            const { available, status } = await this.checkAvailability();
            
            if (!available && status !== 'downloadable') {
                throw new Error('Proofreader API is not available');
            }

            // If language changed or not initialized, create new proofreader
            if (this.proofreader && this.currentLanguage === language) {
                return this.proofreader;
            }

            // Destroy previous instance
            if (this.proofreader) {
                try {
                    this.proofreader.destroy?.();
                } catch (e) {
                    console.warn('[Proofreader] Failed to destroy old instance:', e);
                }
                this.proofreader = null;
            }

            console.log('[Proofreader] Creating new instance for language:', language);

            // Create proofreader with progress monitoring
            this.proofreader = await Proofreader.create({
                expectedInputLanguages: [language],
                monitor(m) {
                    m.addEventListener('downloadprogress', (e) => {
                        const progress = Math.round(e.loaded * 100);
                        console.log(`[Proofreader] Download progress: ${progress}%`);
                        if (onProgress) {
                            onProgress(progress);
                        }
                    });
                }
            });

            this.currentLanguage = language;
            console.log('[Proofreader] Successfully initialized');
            
            return this.proofreader;
        } catch (error) {
            console.error('[Proofreader] Initialization error:', error);
            throw error;
        }
    }

    /**
     * Proofread text and return corrections
     * @param {string} text - Text to proofread
     * @param {string} language - Language of the text
     * @returns {Promise<{correctedText: string, corrections: Array, hasErrors: boolean}>}
     */
    async proofread(text, language = 'en') {
        try {
            if (!text || typeof text !== 'string' || text.trim().length === 0) {
                throw new Error('Text to proofread cannot be empty');
            }

            // Initialize proofreader if needed
            await this.initialize(language);

            if (!this.proofreader) {
                throw new Error('Proofreader not initialized');
            }

            console.log('[Proofreader] Proofreading text:', text.substring(0, 50) + '...');

            // Call the proofread method
            const result = await this.proofreader.proofread(text);

            console.log('[Proofreader] Result:', result);

            // Format the result
            return {
                originalText: text,
                correctedText: result.correctedInput || text,
                corrections: result.corrections || [],
                hasErrors: (result.corrections && result.corrections.length > 0) || false
            };
        } catch (error) {
            console.error('[Proofreader] Error:', error);
            throw error;
        }
    }

    /**
     * Format corrections for display
     * @param {string} originalText - Original text
     * @param {Array} corrections - Array of corrections
     * @returns {string} - HTML formatted text with corrections highlighted
     */
    formatCorrectionsHTML(originalText, corrections) {
        if (!corrections || corrections.length === 0) {
            return `<span class="no-errors">✓ No errors found</span>`;
        }

        let html = '';
        let lastIndex = 0;

        // Sort corrections by start index
        const sortedCorrections = [...corrections].sort((a, b) => a.startIndex - b.startIndex);

        for (const correction of sortedCorrections) {
            // Add text before the error
            if (correction.startIndex > lastIndex) {
                html += `<span class="correct-text">${this.escapeHtml(originalText.substring(lastIndex, correction.startIndex))}</span>`;
            }

            // Add the error with strikethrough
            const errorText = originalText.substring(correction.startIndex, correction.endIndex);
            const correctedText = correction.correction || '';

            html += `<span class="error-text" title="Correction: ${this.escapeHtml(correctedText)}">`;
            html += `<del>${this.escapeHtml(errorText)}</del>`;
            html += `<ins>${this.escapeHtml(correctedText)}</ins>`;
            html += `</span>`;

            lastIndex = correction.endIndex;
        }

        // Add remaining text
        if (lastIndex < originalText.length) {
            html += `<span class="correct-text">${this.escapeHtml(originalText.substring(lastIndex))}</span>`;
        }

        return html;
    }

    /**
     * Escape HTML special characters
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Get summary of corrections
     * @param {Array} corrections 
     * @returns {string}
     */
    getCorrectionsSummary(corrections) {
        if (!corrections || corrections.length === 0) {
            return '✓ No spelling or grammar errors found!';
        }

        const count = corrections.length;
        return `Found ${count} ${count === 1 ? 'error' : 'errors'} to fix`;
    }

    /**
     * Destroy the proofreader instance
     */
    destroy() {
        if (this.proofreader) {
            try {
                this.proofreader.destroy?.();
            } catch (e) {
                console.warn('[Proofreader] Failed to destroy:', e);
            }
            this.proofreader = null;
        }
    }
}

// Singleton export
export const proofreaderService = new ProofreaderService();
