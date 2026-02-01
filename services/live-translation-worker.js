// Live Translation Worker
// Detects and translates real-time captions and audio from video content

import { aiRouter } from './ai-router.js';

class LiveTranslationWorker {
    constructor() {
        this.isActive = false;
        this.targetLanguage = 'en';
        this.detectionMode = 'auto'; // 'auto', 'captions-only', 'audio-only'
        this.observers = [];
        this.lastProcessedText = '';
        this.captionObserver = null;
        this.audioRecognition = null;
        this.onTextDetected = null;
        this.onTranslation = null;
    }

    // Start live translation
    async start(targetLang, mode = 'auto', callbacks = {}) {
        if (this.isActive) {
            console.warn('Live translation already active');
            return;
        }

        this.targetLanguage = targetLang;
        this.detectionMode = mode;
        this.onTextDetected = callbacks.onTextDetected;
        this.onTranslation = callbacks.onTranslation;
        this.isActive = true;

        console.log(`Starting live translation to ${targetLang} in ${mode} mode`);

        // Get active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (!tab) {
            throw new Error('No active tab found');
        }

        // Inject content script for caption detection
        if (mode === 'auto' || mode === 'captions-only') {
            await this.startCaptionDetection(tab.id);
        }

        // Start audio recognition
        if (mode === 'auto' || mode === 'audio-only') {
            await this.startAudioRecognition();
        }

        return true;
    }

    // Stop live translation
    stop() {
        if (!this.isActive) {
            return;
        }

        console.log('Stopping live translation');

        // Stop caption detection
        this.stopCaptionDetection();

        // Stop audio recognition
        this.stopAudioRecognition();

        this.isActive = false;
        this.lastProcessedText = '';
    }

    // Start caption detection
    async startCaptionDetection(tabId) {
        console.log('Starting caption detection on tab:', tabId);

        try {
            // Inject content script to monitor captions
            await chrome.scripting.executeScript({
                target: { tabId },
                func: this.captionDetectorScript,
                args: []
            });

            // Listen for caption updates
            chrome.runtime.onMessage.addListener(this.handleCaptionUpdate.bind(this));

        } catch (error) {
            console.error('Failed to inject caption detector:', error);
        }
    }

    // Content script to detect captions (injected into page)
    captionDetectorScript() {
        // This runs in the page context
        const CAPTION_SELECTORS = [
            '.ytp-caption-segment',                    // YouTube
            '.player-timedtext',                       // YouTube (older)
            '.caption-text',                           // Generic
            '[class*="caption"]',                      // Generic
            '[class*="subtitle"]',                     // Generic
            '.vjs-text-track-display',                 // Video.js
            '.plyr__caption',                          // Plyr
            'span[data-purpose="cue-text"]',          // Vimeo
            '.timed-text',                             // Netflix
            '.player-caption',                         // Generic
        ];

        let lastCaptionText = '';
        let observer = null;

        function detectCaptions() {
            for (const selector of CAPTION_SELECTORS) {
                const captionElement = document.querySelector(selector);

                if (captionElement && captionElement.textContent.trim()) {
                    const currentText = captionElement.textContent.trim();

                    if (currentText !== lastCaptionText) {
                        lastCaptionText = currentText;

                        // Send to background
                        chrome.runtime.sendMessage({
                            action: 'CAPTION_DETECTED',
                            text: currentText,
                            timestamp: Date.now()
                        });

                        return true;
                    }
                }
            }

            return false;
        }

        // Try immediate detection
        detectCaptions();

        // Set up MutationObserver for dynamic captions
        observer = new MutationObserver(() => {
            detectCaptions();
        });

        // Observe the entire document for caption changes
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true
        });

        // Also poll every 500ms as fallback
        setInterval(detectCaptions, 500);

        console.log('Brief AI: Caption detection active');
    }

    // Handle caption updates from content script
    async handleCaptionUpdate(request, sender, sendResponse) {
        if (request.action !== 'CAPTION_DETECTED') {
            return;
        }

        const { text } = request;

        if (!this.isActive || !text || text === this.lastProcessedText) {
            return;
        }

        this.lastProcessedText = text;

        console.log('Caption detected:', text);

        // Notify original text
        if (this.onTextDetected) {
            this.onTextDetected(text);
        }

        // Detect language
        try {
            const detected = await aiRouter.detectLanguage(text);
            console.log('Detected language:', detected.detectedLanguage);

            // Only translate if different from target
            if (detected.detectedLanguage !== this.targetLanguage) {
                await this.translateText(text, detected.detectedLanguage);
            }

        } catch (error) {
            console.error('Caption processing error:', error);
        }
    }

    // Start audio recognition (Web Speech API)
    async startAudioRecognition() {
        if (!('webkitSpeechRecognition' in window)) {
            console.warn('Speech recognition not supported');
            return;
        }

        try {
            const SpeechRecognition = window.webkitSpeechRecognition;
            this.audioRecognition = new SpeechRecognition();

            this.audioRecognition.continuous = true;
            this.audioRecognition.interimResults = true;
            this.audioRecognition.lang = 'auto'; // Auto-detect

            this.audioRecognition.onresult = async (event) => {
                const last = event.results.length - 1;
                const text = event.results[last][0].transcript;

                if (event.results[last].isFinal && text.trim()) {
                    console.log('Audio detected:', text);

                    if (this.onTextDetected) {
                        this.onTextDetected(text);
                    }

                    // Detect and translate
                    try {
                        const detected = await aiRouter.detectLanguage(text);

                        if (detected.detectedLanguage !== this.targetLanguage) {
                            await this.translateText(text, detected.detectedLanguage);
                        }
                    } catch (error) {
                        console.error('Audio processing error:', error);
                    }
                }
            };

            this.audioRecognition.onerror = (event) => {
                console.error('Speech recognition error:', event.error);
            };

            this.audioRecognition.start();
            console.log('Audio recognition started');

        } catch (error) {
            console.error('Failed to start audio recognition:', error);
        }
    }

    // Stop caption detection
    stopCaptionDetection() {
        // Clean up is handled by the injected script's lifecycle
        chrome.runtime.onMessage.removeListener(this.handleCaptionUpdate);
    }

    // Stop audio recognition
    stopAudioRecognition() {
        if (this.audioRecognition) {
            this.audioRecognition.stop();
            this.audioRecognition = null;
            console.log('Audio recognition stopped');
        }
    }

    // Translate detected text
    async translateText(text, sourceLang) {
        try {
            console.log(`Translating from ${sourceLang} to ${this.targetLanguage}`);

            const result = await aiRouter.translate(text, this.targetLanguage, sourceLang);

            if (this.onTranslation) {
                this.onTranslation(result.translatedText, sourceLang);
            }

            return result.translatedText;

        } catch (error) {
            console.error('Translation error:', error);
            throw error;
        }
    }

    // Check if worker is active
    isRunning() {
        return this.isActive;
    }
}

// Export singleton instance
export const liveTranslationWorker = new LiveTranslationWorker();
