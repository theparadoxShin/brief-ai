// Side Panel JavaScript - Gestion de l'interface utilisateur

class SidePanelUI {
    constructor() {
        this.currentTab = 'summarize';
        this.chatHistory = [];
        this.ttsState = {
            isSpeaking: false,
            isPaused: false,
            currentUtterance: null
        };
        this.init();
    }

    init() {
        // Initialize tabs
        this.initTabs();
        
        // Initialize buttons
        this.initButtons();
        
        // Check AI availability
        this.checkAIStatus();
        
        // Listen for context menu actions
        this.listenForContextActions();
        
        // Load last result if available
        this.loadLastResult();

        // Ensure voices are loaded for TTS
        this.ensureVoicesLoaded();
    }

    // ===== TTS VOICE LOADING =====
    ensureVoicesLoaded() {
        if ('speechSynthesis' in window) {
            // Voices might not be loaded immediately
            if (window.speechSynthesis.getVoices().length === 0) {
                window.speechSynthesis.addEventListener('voiceschanged', () => {
                    console.log('Voices loaded:', window.speechSynthesis.getVoices().length);
                }, { once: true });
            }
        }
    }

    // ===== TABS NAVIGATION =====
    initTabs() {
        const tabButtons = document.querySelectorAll('.tab-btn');
        const tabContents = document.querySelectorAll('.tab-content');

        tabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const tabId = btn.dataset.tab;
                
                // Remove active class from all
                tabButtons.forEach(b => b.classList.remove('active'));
                tabContents.forEach(c => c.classList.remove('active'));
                
                // Add active class to current
                btn.classList.add('active');
                document.getElementById(`${tabId}-tab`).classList.add('active');
                
                this.currentTab = tabId;
            });
        });
    }

    // ===== INITIALIZE BUTTONS =====
    initButtons() {
        // Summarize button
        document.getElementById('summarize-btn').addEventListener('click', () => {
            this.handleSummarize();
        });

        // Copy buttons
        document.getElementById('copy-summary').addEventListener('click', () => {
            this.copyToClipboard('summary-output');
        });

        // TTS controls
        const playBtn = document.getElementById('play-summary');
        if (playBtn) {
            console.log('Play button found');
            playBtn.addEventListener('click', () => this.handlePlaySummary());
        }

        const pauseBtn = document.getElementById('pause-summary');
        if (pauseBtn) {
            console.log('Pause button found');
            pauseBtn.addEventListener('click', () => this.handlePauseSummary());
        }

        const stopBtn = document.getElementById('stop-summary');
        if (stopBtn) {
            console.log('Stop button found');
            stopBtn.addEventListener('click', () => this.handleStopSummary());
        }

        document.getElementById('copy-translation').addEventListener('click', () => {
            this.copyToClipboard('translation-output');
        });
    }

    // ===== CHECK AI STATUS =====
    async checkAIStatus() {
        try {
            const response = await chrome.runtime.sendMessage({
                action: 'CHECK_AI_AVAILABILITY'
            });

            if (response.success) {
                this.updateStatusIndicator(response.data);
            }
        } catch (error) {
            console.error('Error checking AI status:', error);
            this.updateStatusIndicator(null, true);
        }
    }

    updateStatusIndicator(status, error = false) {
        const indicator = document.getElementById('statusIndicator');
        const statusText = indicator.querySelector('.status-text');

        if (error) {
            indicator.className = 'status-indicator error';
            statusText.textContent = 'Error checking AI';
            return;
        }

        const allReady = status && 
            Object.values(status).every(s => s === 'readily' || s === 'yes');

        if (allReady) {
            indicator.className = 'status-indicator ready';
            statusText.textContent = 'All AI features ready';
        } else {
            indicator.className = 'status-indicator warning';
            statusText.textContent = 'Some features downloading...';
        }
    }

    // ===== LISTEN FOR CONTEXT MENU ACTIONS =====
    listenForContextActions() {
        // Listen for storage changes (when context menu is used)
        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'local' && changes.currentAction) {
                const action = changes.currentAction.newValue;
                this.handleContextAction(action);
            }
            
            if (namespace === 'local' && changes.lastResult) {
                const result = changes.lastResult.newValue;
                this.displayResult(result);
            }
        });
    }

    async loadLastResult() {
        try {
            const { lastResult } = await chrome.storage.local.get('lastResult');
            if (lastResult) {
                this.displayResult(lastResult);
            }
        } catch (error) {
            console.error('Error loading last result:', error);
        }
    }

    handleContextAction(action) {
        // Switch to appropriate tab
        const tabMap = {
            'summarize': 'summarize',
            'translate': 'translate',
            'detectLanguage': 'detect',
            'promptAI': 'chat'
        };

        const targetTab = tabMap[action.type];
        if (targetTab) {
            // Click the tab button to switch
            const tabBtn = document.querySelector(`[data-tab="${targetTab}"]`);
            if (tabBtn) {
                tabBtn.click();
            }

            // Fill the input with the selected text
            const inputId = `${targetTab === 'chat' ? 'chat' : action.type}-input`;
            const input = document.getElementById(inputId);
            if (input) {
                input.value = action.text;
            }
        }
    }

    displayResult(result) {
        if (result.error) {
            this.showError(result.error);
            return;
        }

        switch (result.action) {
            case 'summarize':
                this.displaySummaryResult(result.output);
                break;
            case 'translate':
                this.displayTranslationResult(result.output);
                break;
            case 'detectLanguage':
                this.displayLanguageResult(result.output);
                break;
            case 'promptAI':
                this.displayChatResult(result.input, result.output);
                break;
        }
    }

    // ===== SUMMARIZE =====
    async handleSummarize() {
        const input = document.getElementById('summarize-input').value.trim();
        
        if (!input) {
            this.showError('Please enter text to summarize');
            return;
        }

        const type = document.getElementById('summary-type').value;
        const length = document.getElementById('summary-length').value;

        this.showLoading('Summarizing text...');

        try {
            const response = await chrome.runtime.sendMessage({
                action: 'SUMMARIZE',
                text: input,
                options: { type, length }
            });

            this.hideLoading();

            if (response.success) {
                this.displaySummaryResult(response.data);
            } else {
                this.showError(response.error || 'Summarization failed');
            }
        } catch (error) {
            this.hideLoading();
            this.showError(error.message);
        }
    }

    displaySummaryResult(data) {
        const resultSection = document.getElementById('summarize-result');
        const output = document.getElementById('summary-output');
        const stats = document.getElementById('summary-stats');

        output.textContent = data.summary;
        stats.innerHTML = `
            <span>📏 Original: ${data.originalLength} chars</span>
            <span>📝 Summary: ${data.summaryLength} chars</span>
            <span>📊 Compression: ${data.compressionRatio}</span>
        `;

        resultSection.style.display = 'block';
        resultSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // ===== TTS: Play Summary =====
    handlePlaySummary() {
        const text = (document.getElementById('summary-output')?.textContent || '').trim();
        if (!text) {
            this.showError('No summary to play');
            return;
        }

        if (this.ttsState.isPaused) {
            // Resume if paused
            window.speechSynthesis.resume();
            this.ttsState.isPaused = false;
            this.updateTTSButtons('playing');
        } else {
            // Start new speech
            this.speak(text, { lang: 'en-US' });
        }
    }

    handlePauseSummary() {
        if (this.ttsState.isSpeaking && !this.ttsState.isPaused) {
            window.speechSynthesis.pause();
            this.ttsState.isPaused = true;
            this.updateTTSButtons('paused');
        }
    }

    handleStopSummary() {
        window.speechSynthesis.cancel();
        this.ttsState.isSpeaking = false;
        this.ttsState.isPaused = false;
        this.ttsState.currentUtterance = null;
        this.updateTTSButtons('stopped');
    }

    updateTTSButtons(state) {
        const playBtn = document.getElementById('play-summary');
        const pauseBtn = document.getElementById('pause-summary');
        const stopBtn = document.getElementById('stop-summary');

        if (!playBtn || !pauseBtn || !stopBtn) return;

        switch (state) {
            case 'playing':
                playBtn.style.display = 'none';
                pauseBtn.style.display = 'inline-flex';
                stopBtn.style.display = 'inline-flex';
                break;
            case 'paused':
                playBtn.style.display = 'inline-flex';
                pauseBtn.style.display = 'none';
                stopBtn.style.display = 'inline-flex';
                break;
            case 'stopped':
            default:
                playBtn.style.display = 'inline-flex';
                pauseBtn.style.display = 'none';
                stopBtn.style.display = 'none';
                break;
        }
    }

    speak(text, options = {}) {
        try {
            if (!('speechSynthesis' in window)) {
                this.showError('Text-to-Speech not supported in this browser');
                return;
            }

            // Cancel any ongoing speech
            window.speechSynthesis.cancel();

            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = options.lang || 'en-US';
            utterance.rate = options.rate || 1.0;
            utterance.pitch = options.pitch || 1.0;
            utterance.volume = options.volume || 1.0;

            utterance.onstart = () => {
                this.ttsState.isSpeaking = true;
                this.ttsState.isPaused = false;
                this.ttsState.currentUtterance = utterance;
                this.updateTTSButtons('playing');
                console.log('Speech started');
            }
            utterance.onend = () => {
                this.ttsState.isSpeaking = false;
                this.ttsState.isPaused = false;
                this.ttsState.currentUtterance = null;
                this.updateTTSButtons('stopped');
            }
            utterance.onerror = (e) => {
                console.error('TTS error:', e);
                
                // Don't show error for intentional cancellations (stop button)
                if (e.error !== 'canceled' && e.error !== 'interrupted') {
                    this.showError('An error occurred during speech synthesis');
                }
                
                this.ttsState.isSpeaking = false;
                this.ttsState.isPaused = false;
                this.ttsState.currentUtterance = null;
                this.updateTTSButtons('stopped');
            }

            window.speechSynthesis.speak(utterance);
            console.log('Speech started');
            console.log('Speech queued:', text);
        } catch (error) {
            console.error('TTS error:', error);
            this.showError('Failed to play speech');
            this.showError(error.message);
            this.updateTTSButtons('stopped');
        }
    }



    // ===== UTILITY FUNCTIONS =====
    async copyToClipboard(elementId) {
        const element = document.getElementById(elementId);
        const text = element.textContent;
        
        try {
            await navigator.clipboard.writeText(text);
            this.showToast('Copied to clipboard! ✓');
        } catch (error) {
            console.error('Copy failed:', error);
        }
    }

    getLanguageName(code) {
        const languages = {
            'en': 'English',
            'fr': 'French',
            'es': 'Spanish',
            'de': 'German',
            'it': 'Italian',
            'pt': 'Portuguese',
            'ru': 'Russian',
            'zh': 'Chinese',
            'ja': 'Japanese',
            'ko': 'Korean',
            'ar': 'Arabic',
            'nl': 'Dutch',
            'pl': 'Polish',
            'tr': 'Turkish'
        };
        return languages[code] || code.toUpperCase();
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showLoading(text = 'Processing...') {
        const overlay = document.getElementById('loadingOverlay');
        const loadingText = document.getElementById('loadingText');
        loadingText.textContent = text;
        overlay.style.display = 'flex';
    }

    hideLoading() {
        const overlay = document.getElementById('loadingOverlay');
        overlay.style.display = 'none';
    }

    showError(message) {
        alert(` Error: ${message}`);
    }

    showToast(message) {
        // Simple toast notification
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: #10b981;
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            z-index: 9999;
            animation: slideIn 0.3s ease;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 2000);
    }
}

// Initialize the UI when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new SidePanelUI();
});

// Add CSS for toast animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);
