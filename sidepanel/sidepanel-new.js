/**
 * Brief AI - Side Panel Controller
 * Version: 1.1.0
 * Clean, optimized, and debugged version
 */
(function() {
    'use strict';

    // ===== DOM HELPERS =====
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => Array.from(document.querySelectorAll(sel));

    // ===== STATE =====
    let liveActive = false;
    let ttsState = { isSpeaking: false, isPaused: false, utterance: null };

    // ===== UTILITIES =====
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text ?? '';
        return div.innerHTML;
    }

    function renderMarkdownLite(text) {
        if (!text) return '';
        return escapeHtml(text)
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            .replace(/`(.+?)`/g, '<code>$1</code>')
            .replace(/\n/g, '<br>');
    }

    function showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            padding: 12px 18px;
            background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#6366f1'};
            color: white;
            border-radius: 8px;
            font-size: 13px;
            font-weight: 500;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 9999;
            animation: slideIn 0.3s ease;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 2500);
    }

    function showError(msg) {
        showToast(msg, 'error');
        console.error('[Brief AI]', msg);
    }

    function setButtonLoading(btn, loading) {
        if (!btn) return;
        if (loading) {
            btn.classList.add('loading');
            btn.disabled = true;
        } else {
            btn.classList.remove('loading');
            btn.disabled = false;
        }
    }

    async function getActiveTabId() {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        return tabs?.[0]?.id ?? null;
    }

    // ===== INITIALIZATION =====
    function init() {
        console.log('[Brief AI] Initializing...');
        
        // Set footer year
        const footerYear = $('#footerYear');
        if (footerYear) footerYear.textContent = new Date().getFullYear();

        // Initialize all features
        initCategoryNavigation();
        initSubTabs();
        initAIModeToggle();
        initSummarize();
        initTranslate();
        initProofread();
        initChat();
        initLiveTranslation();
        initWorkerFeatures();
        
        // Check AI status
        checkAIStatus();
        
        // Listen for context menu actions
        listenForContextActions();

        // Add global CSS for toast animations
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
            @keyframes slideOut { from { transform: translateX(0); opacity: 1; } to { transform: translateX(100%); opacity: 0; } }
        `;
        document.head.appendChild(style);

        console.log('[Brief AI] Initialized successfully');
    }

    // ===== CATEGORY NAVIGATION =====
    function initCategoryNavigation() {
        const categoryBtns = $$('.cat-pill');
        const categoryContents = $$('.category-content');

        categoryBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const category = btn.dataset.category;
                
                // Update buttons
                categoryBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                // Update content
                categoryContents.forEach(c => c.classList.remove('active'));
                const target = $(`#${category}-category`);
                if (target) target.classList.add('active');
            });
        });
    }

    // ===== SUB TABS =====
    function initSubTabs() {
        $$('.sub-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const container = tab.closest('.category-content');
                if (!container) return;

                // Update tab buttons
                container.querySelectorAll('.sub-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                // Update tab content
                const tabName = tab.dataset.tab;
                container.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                const target = container.querySelector(`#${tabName}-tab`);
                if (target) target.classList.add('active');
            });
        });
    }

    // ===== AI MODE TOGGLE =====
    function initAIModeToggle() {
        const localBtn = $('#localModeBtn');
        const cloudBtn = $('#cloudModeBtn');
        const authSection = $('#authSection');
        const signInBtn = $('#signInBtn');

        localBtn?.addEventListener('click', async () => {
            localBtn.classList.add('active');
            cloudBtn.classList.remove('active');
            authSection.style.display = 'none';
            
            try {
                await chrome.runtime.sendMessage({ action: 'SET_AI_MODE', mode: 'local' });
                showToast('Switched to Local AI (Gemini Nano)');
            } catch (e) {
                console.warn('Failed to set AI mode:', e);
            }
        });

        cloudBtn?.addEventListener('click', async () => {
            cloudBtn.classList.add('active');
            localBtn.classList.remove('active');
            authSection.style.display = 'block';
            
            try {
                await chrome.runtime.sendMessage({ action: 'SET_AI_MODE', mode: 'online' });
            } catch (e) {
                console.warn('Failed to set AI mode:', e);
            }
        });

        // Sign In button - redirect to landing page
        signInBtn?.addEventListener('click', () => {
            // Open landing page for authentication
            chrome.tabs.create({ url: chrome.runtime.getURL('landing/index.html') });
        });

        // Sign Out button handler
        const signOutBtn = $('#signOutBtn');
        signOutBtn?.addEventListener('click', async () => {
            if (!confirm('Sign out of Brief AI Cloud?')) return;
            
            try {
                await chrome.storage.local.remove(['userAuth']);
                localStorage.removeItem('briefai_auth');
                showToast('Signed out successfully');
                
                // Reset UI
                const authPrompt = $('#authPrompt');
                const userInfo = $('#userInfo');
                if (authPrompt) authPrompt.style.display = 'block';
                if (userInfo) userInfo.style.display = 'none';
                
                // Switch back to local mode
                localBtn?.click();
            } catch (e) {
                showError('Failed to sign out');
            }
        });

        // Cloud Model Selector
        const modelSelect = $('#cloudModelSelect');
        modelSelect?.addEventListener('change', async (e) => {
            const selectedModel = e.target.value;
            try {
                await chrome.storage.local.set({ selectedModel: selectedModel });
                await chrome.runtime.sendMessage({ 
                    action: 'SET_CLOUD_MODEL', 
                    model: selectedModel 
                });
                
                const modelNames = {
                    'gemini-1.5-flash': 'Gemini 1.5 Flash',
                    'gemini-1.5-pro': 'Gemini 1.5 Pro',
                    'gemini-2.0-flash': 'Gemini 2.0 Flash'
                };
                showToast(`Switched to ${modelNames[selectedModel] || selectedModel}`);
            } catch (e) {
                console.warn('Failed to set cloud model:', e);
            }
        });

        // Check and restore saved mode and model
        chrome.storage.local.get(['aiMode', 'userAuth', 'selectedModel'], (result) => {
            if (result.aiMode === 'online') {
                cloudBtn?.click();
            }
            
            // Restore selected model
            if (result.selectedModel && modelSelect) {
                modelSelect.value = result.selectedModel;
            }
            
            // If user is authenticated, show user info
            if (result.userAuth?.isAuthenticated) {
                showUserInfo(result.userAuth);
            }
        });
    }

    function showUserInfo(auth) {
        const authPrompt = $('#authPrompt');
        const userInfo = $('#userInfo');
        const userAvatar = $('#userAvatar');
        const userName = $('#userName');
        const userPlan = $('#userPlan');

        if (authPrompt) authPrompt.style.display = 'none';
        if (userInfo) userInfo.style.display = 'flex';
        if (userAvatar) userAvatar.src = auth.photoURL || '';
        if (userName) userName.textContent = auth.displayName || auth.email || 'User';
        if (userPlan) userPlan.textContent = auth.plan || 'Free';
    }

    // ===== SUMMARIZE =====
    function initSummarize() {
        const btn = $('#summarize-btn');
        const input = $('#summarize-input');
        const typeSelect = $('#summary-type');
        const lengthSelect = $('#summary-length');

        btn?.addEventListener('click', async () => {
            const text = input?.value?.trim();
            if (!text) {
                showError('Please enter text to summarize');
                return;
            }

            const type = typeSelect?.value || 'tldr';
            const length = lengthSelect?.value || 'medium';

            setButtonLoading(btn, true);

            try {
                console.log('[Brief AI] Sending SUMMARIZE request...');
                const response = await chrome.runtime.sendMessage({
                    action: 'SUMMARIZE',
                    text: text,
                    options: { type, length }
                });

                console.log('[Brief AI] SUMMARIZE response:', response);

                if (response?.success && response?.data) {
                    displaySummaryResult(response.data);
                    showToast('Summary generated!');
                } else {
                    const errorMsg = response?.error || 'Summarization failed. Make sure Gemini Nano is available.';
                    showError(errorMsg);
                }
            } catch (error) {
                console.error('[Brief AI] Summarize error:', error);
                showError(`Summarization failed: ${error.message}`);
            } finally {
                setButtonLoading(btn, false);
            }
        });

        // Initialize TTS buttons
        $('#play-summary')?.addEventListener('click', handlePlaySummary);
        $('#pause-summary')?.addEventListener('click', handlePauseSummary);
        $('#stop-summary')?.addEventListener('click', handleStopSummary);
        $('#copy-summary')?.addEventListener('click', async () => {
            const text = $('#summary-output')?.textContent || '';
            if (!text.trim()) {
                showToast('Nothing to copy', 'info');
                return;
            }
            try {
                await navigator.clipboard.writeText(text);
                showToast('Copied to clipboard!');
            } catch (e) {
                showError('Failed to copy');
            }
        });
    }

    function displaySummaryResult(data) {
        const section = $('#summarize-result');
        const output = $('#summary-output');
        const stats = $('#summary-stats');

        if (output) {
            output.textContent = data?.summary || 'No summary generated.';
        }

        if (stats) {
            stats.innerHTML = `
                <span>📏 Original: ${data?.originalLength || 0} chars</span>
                <span>📝 Summary: ${data?.summaryLength || 0} chars</span>
                <span>📊 Reduced: ${data?.compressionRatio || '-'}</span>
            `;
        }

        if (section) {
            section.style.display = 'block';
            section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }

    // ===== TTS HANDLERS =====
    function handlePlaySummary() {
        const text = $('#summary-output')?.textContent?.trim();
        if (!text) {
            showError('No summary to play');
            return;
        }

        if (ttsState.isPaused) {
            window.speechSynthesis.resume();
            ttsState.isPaused = false;
            updateTTSButtons('playing');
            return;
        }

        speak(text, { lang: 'en-US' });
    }

    function handlePauseSummary() {
        if (ttsState.isSpeaking && !ttsState.isPaused) {
            window.speechSynthesis.pause();
            ttsState.isPaused = true;
            updateTTSButtons('paused');
        }
    }

    function handleStopSummary() {
        window.speechSynthesis.cancel();
        ttsState = { isSpeaking: false, isPaused: false, utterance: null };
        updateTTSButtons('stopped');
    }

    function updateTTSButtons(state) {
        const play = $('#play-summary');
        const pause = $('#pause-summary');
        const stop = $('#stop-summary');

        if (!play || !pause || !stop) return;

        if (state === 'playing') {
            play.style.display = 'none';
            pause.style.display = 'inline-flex';
            stop.style.display = 'inline-flex';
        } else if (state === 'paused') {
            play.style.display = 'inline-flex';
            pause.style.display = 'none';
            stop.style.display = 'inline-flex';
        } else {
            play.style.display = 'inline-flex';
            pause.style.display = 'none';
            stop.style.display = 'none';
        }
    }

    function speak(text, opts = {}) {
        if (!('speechSynthesis' in window)) {
            showError('Text-to-Speech not supported');
            return;
        }

        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = opts.lang || 'en-US';
        utterance.rate = opts.rate || 1;
        utterance.pitch = opts.pitch || 1;
        utterance.volume = opts.volume || 1;

        utterance.onstart = () => {
            ttsState = { isSpeaking: true, isPaused: false, utterance };
            updateTTSButtons('playing');
        };

        utterance.onend = () => {
            ttsState = { isSpeaking: false, isPaused: false, utterance: null };
            updateTTSButtons('stopped');
        };

        utterance.onerror = (e) => {
            const reason = (e?.error || '').toString().toLowerCase();
            if (!reason.includes('cancel') && !reason.includes('interrupted')) {
                showError('Speech synthesis error');
            }
            ttsState = { isSpeaking: false, isPaused: false, utterance: null };
            updateTTSButtons('stopped');
        };

        window.speechSynthesis.speak(utterance);
    }

    // ===== TRANSLATE =====
    function initTranslate() {
        const input = $('#translate-input');
        const sourceLang = $('#source-lang');
        const targetLang = $('#target-lang');
        let debounceTimer;

        const handleTranslate = () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(handleRealtimeTranslate, 400);
        };

        input?.addEventListener('input', handleTranslate);
        sourceLang?.addEventListener('change', () => {
            if (input?.value?.trim()) handleTranslate();
        });
        targetLang?.addEventListener('change', () => {
            if (input?.value?.trim()) handleTranslate();
        });

        $('#copy-translation')?.addEventListener('click', async () => {
            const output = $('#translation-output');
            const text = output?.textContent?.trim() || '';
            if (!text || text.includes('Translation will appear')) {
                showToast('No translation to copy', 'info');
                return;
            }
            try {
                await navigator.clipboard.writeText(text);
                showToast('Translation copied!');
            } catch (e) {
                showError('Failed to copy');
            }
        });
    }

    async function handleRealtimeTranslate() {
        const input = $('#translate-input')?.value?.trim() || '';
        const output = $('#translation-output');
        const status = $('#translation-status');
        const section = $('#translate-result');

        if (!input) {
            if (output) output.innerHTML = '<span class="placeholder-text">Translation will appear here...</span>';
            if (status) status.textContent = '';
            return;
        }

        const source = $('#source-lang')?.value || 'auto';
        const target = $('#target-lang')?.value || 'en';

        if (source !== 'auto' && source === target) {
            if (output) output.textContent = input;
            if (status) status.textContent = 'Same language';
            return;
        }

        if (status) {
            status.textContent = 'Translating...';
            status.className = 'status-badge translating';
        }
        if (output) output.innerHTML = '<span class="placeholder-text">Translating...</span>';

        try {
            const port = chrome.runtime.connect({ name: 'translate-stream' });
            let fullTranslation = '';

            port.onMessage.addListener((msg) => {
                if (msg.type === 'chunk') {
                    fullTranslation = msg.chunk;
                    if (output) output.textContent = fullTranslation;
                } else if (msg.type === 'done') {
                    if (status) {
                        status.textContent = 'Done';
                        status.className = 'status-badge';
                    }
                } else if (msg.type === 'error') {
                    if (status) {
                        status.textContent = 'Error';
                        status.className = 'status-badge';
                    }
                    if (output) {
                        output.innerHTML = `<span class="placeholder-text" style="color: var(--danger);">${escapeHtml(msg.error || 'Translation failed')}</span>`;
                    }
                }
            });

            port.postMessage({
                action: 'TRANSLATE_STREAM',
                text: input,
                targetLanguage: target,
                sourceLanguage: source === 'auto' ? 'auto' : source
            });
        } catch (error) {
            if (status) {
                status.textContent = 'Error';
                status.className = 'status-badge';
            }
            if (output) {
                output.innerHTML = `<span class="placeholder-text" style="color: var(--danger);">${escapeHtml(error.message)}</span>`;
            }
        }
    }

    // ===== PROOFREAD =====
    function initProofread() {
        const btn = $('#proofread-btn');
        const input = $('#proofread-input');
        const copyBtn = $('#copy-corrected');

        btn?.addEventListener('click', handleProofread);

        copyBtn?.addEventListener('click', async () => {
            const output = $('#proofread-output');
            // Get the corrected text (stored in data attribute)
            const correctedText = output?.dataset?.correctedText || '';
            if (!correctedText) {
                showToast('No corrected text to copy', 'info');
                return;
            }
            try {
                await navigator.clipboard.writeText(correctedText);
                showToast('Corrected text copied!');
            } catch (e) {
                showError('Failed to copy');
            }
        });
    }

    async function handleProofread() {
        const btn = $('#proofread-btn');
        const input = $('#proofread-input');
        const text = input?.value?.trim() || '';

        if (!text) {
            showToast('Please enter some text to proofread', 'info');
            return;
        }

        const lang = $('#proofread-lang')?.value || 'en';

        setButtonLoading(btn, true);

        try {
            const response = await chrome.runtime.sendMessage({
                action: 'PROOFREAD',
                text: text,
                language: lang
            });

            if (response?.success && response?.data) {
                displayProofreadResult(response.data);
                if (response.data.hasErrors) {
                    showToast(`Found ${response.data.corrections.length} issue(s)`, 'info');
                } else {
                    showToast('No errors found! ✓', 'success');
                }
            } else {
                const errorMsg = response?.error || 'Proofreading failed. Make sure Proofreader API is enabled.';
                showError(errorMsg);
            }
        } catch (error) {
            console.error('[Brief AI] Proofread error:', error);
            showError(`Proofreading failed: ${error.message}`);
        } finally {
            setButtonLoading(btn, false);
        }
    }

    function displayProofreadResult(data) {
        const section = $('#proofread-result');
        const output = $('#proofread-output');
        const stats = $('#proofread-stats');
        const status = $('#proofread-status');

        if (status) {
            if (data.hasErrors) {
                status.textContent = `${data.corrections.length} issue(s)`;
                status.className = 'status-badge error';
            } else {
                status.textContent = '✓ Perfect';
                status.className = 'status-badge success';
            }
        }

        if (output) {
            // Store corrected text for copy button
            output.dataset.correctedText = data.correctedText || data.originalText;

            if (data.hasErrors) {
                // Display with corrections highlighted
                output.innerHTML = formatCorrectionsHTML(data.originalText, data.corrections);
            } else {
                output.innerHTML = `
                    <div class="no-errors">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: #10b981;">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                        <span>No spelling or grammar errors found!</span>
                    </div>
                `;
            }
        }

        if (stats) {
            stats.innerHTML = `
                <span>📝 Characters: ${data.originalText?.length || 0}</span>
                <span>🔧 Corrections: ${data.corrections?.length || 0}</span>
            `;
        }

        if (section) {
            section.style.display = 'block';
            section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }

    function formatCorrectionsHTML(originalText, corrections) {
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
                html += `<span class="correct-text">${escapeHtml(originalText.substring(lastIndex, correction.startIndex))}</span>`;
            }

            // Add the error with strikethrough and correction
            const errorText = originalText.substring(correction.startIndex, correction.endIndex);
            const correctedText = correction.correction || '';

            html += `<span class="error-highlight" title="Suggestion: ${escapeHtml(correctedText)}">`;
            html += `<del class="error-del">${escapeHtml(errorText)}</del>`;
            html += `<ins class="error-ins">${escapeHtml(correctedText)}</ins>`;
            html += `</span>`;

            lastIndex = correction.endIndex;
        }

        // Add remaining text
        if (lastIndex < originalText.length) {
            html += `<span class="correct-text">${escapeHtml(originalText.substring(lastIndex))}</span>`;
        }

        return html;
    }

    // ===== AI CHAT =====
    function initChat() {
        const btn = $('#chat-send-btn');
        const input = $('#chat-input');

        btn?.addEventListener('click', handleChatSend);
        input?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleChatSend();
            }
        });
    }

    async function handleChatSend() {
        const input = $('#chat-input');
        const message = input?.value?.trim();
        
        if (!message) return;

        input.value = '';
        addChatMessage(message, 'user');
        
        const thinkingId = addChatThinking();
        const streamId = createStreamingMessage();

        try {
            const port = chrome.runtime.connect({ name: 'ai-chat-stream' });
            let fullResponse = '';

            port.onMessage.addListener((msg) => {
                if (msg.type === 'chunk') {
                    fullResponse = msg.chunk;
                    updateStreamingMessage(streamId, fullResponse);
                } else if (msg.type === 'done') {
                    removeChatThinking(thinkingId);
                    if (fullResponse) {
                        updateStreamingMessage(streamId, fullResponse);
                    }
                } else if (msg.type === 'error') {
                    removeChatThinking(thinkingId);
                    removeStreamingMessage(streamId);
                    showError(msg.error || 'AI chat failed');
                }
            });

            port.postMessage({ action: 'PROMPT_AI_STREAM', text: message });
        } catch (error) {
            removeChatThinking(thinkingId);
            removeStreamingMessage(streamId);
            showError(error.message);
        }
    }

    function addChatMessage(content, type) {
        const container = $('#chat-messages');
        const welcome = container?.querySelector('.chat-welcome');
        if (welcome) welcome.remove();

        const div = document.createElement('div');
        div.className = 'chat-message';
        const cls = type === 'user' ? 'message-user' : 'message-ai';
        
        div.innerHTML = `
            <div class="${cls}">
                <div class="message-content">${renderMarkdownLite(content)}</div>
                <div class="message-time">${new Date().toLocaleTimeString()}</div>
            </div>
        `;

        container?.appendChild(div);
        if (container) container.scrollTop = container.scrollHeight;
    }

    function addChatThinking() {
        const container = $('#chat-messages');
        const id = 'thinking-' + Date.now();
        
        const div = document.createElement('div');
        div.id = id;
        div.className = 'chat-message';
        div.innerHTML = `
            <div class="message-ai thinking">
                <div class="thinking-dots">
                    <span></span><span></span><span></span>
                </div>
                <div class="message-content">AI is thinking...</div>
            </div>
        `;

        container?.appendChild(div);
        if (container) container.scrollTop = container.scrollHeight;
        return id;
    }

    function removeChatThinking(id) {
        document.getElementById(id)?.remove();
    }

    function createStreamingMessage() {
        const container = $('#chat-messages');
        const id = 'streaming-' + Date.now();
        
        const div = document.createElement('div');
        div.id = id;
        div.className = 'chat-message';
        div.innerHTML = `
            <div class="message-ai">
                <div class="message-content"></div>
                <div class="message-time">${new Date().toLocaleTimeString()}</div>
            </div>
        `;

        container?.appendChild(div);
        if (container) container.scrollTop = container.scrollHeight;
        return id;
    }

    function updateStreamingMessage(id, content) {
        const div = document.getElementById(id);
        const contentEl = div?.querySelector('.message-content');
        if (contentEl) {
            contentEl.innerHTML = renderMarkdownLite(content || '');
            const container = $('#chat-messages');
            if (container) container.scrollTop = container.scrollHeight;
        }
    }

    function removeStreamingMessage(id) {
        document.getElementById(id)?.remove();
    }

    // ===== LIVE TRANSLATION =====
    function initLiveTranslation() {
        const toggleBtn = $('#toggleLiveTranslate');
        
        toggleBtn?.addEventListener('click', async () => {
            if (!liveActive) {
                await startLiveTranslation();
            } else {
                await stopLiveTranslation();
            }
        });

        // Listen for live translation updates
        chrome.runtime.onMessage.addListener((msg) => {
            if (!msg) return;

            if (msg.type === 'LIVE_TRANSLATION_UPDATE') {
                const detected = $('#detectedLang');
                const original = $('#originalText');
                const translated = $('#translatedText');

                if (msg.detectedLanguage && detected) {
                    detected.textContent = `Detected: ${msg.detectedLanguage}`;
                }
                if (msg.original && original) {
                    original.textContent = msg.original;
                    original.classList.add('updating');
                    setTimeout(() => original.classList.remove('updating'), 150);
                }
                if (msg.translated && translated) {
                    translated.textContent = msg.translated;
                    translated.classList.add('updating');
                    setTimeout(() => translated.classList.remove('updating'), 150);
                }
            } else if (msg.type === 'LIVE_AUDIO_LEVELS') {
                const level = Math.max(0, Math.min(1, Number(msg.level) || 0));
                const pct = Math.round(level * 100);
                const bar = $('#audioLevelBar');
                const val = $('#audioLevelVal');
                if (bar) bar.style.width = pct + '%';
                if (val) val.textContent = pct + '%';
            } else if (msg.type === 'LIVE_AUDIO_STATUS' || msg.type === 'LIVE_TRANSLATION_STATUS') {
                const statusText = $('#statusIndicator .status-text');
                if (statusText && msg.message) {
                    statusText.textContent = msg.message;
                }
            }
        });
    }

    async function startLiveTranslation() {
        const tabId = await getActiveTabId();
        if (!tabId) {
            showError('No active tab found');
            return;
        }

        const targetLang = $('#live-target-lang')?.value || 'en';
        const mode = $('#detection-mode')?.value || 'auto';
        const toggleBtn = $('#toggleLiveTranslate');
        const liveDisplay = $('#liveDisplay');

        setButtonLoading(toggleBtn, true);

        try {
            await chrome.tabs.sendMessage(tabId, {
                action: 'START_LIVE_TRANSLATION',
                targetLanguage: targetLang,
                detectionMode: mode,
                showOverlay: true
            });

            // Start audio capture if not captions-only
            if (mode !== 'captions-only') {
                await chrome.runtime.sendMessage({ action: 'START_AUDIO_CAPTURE' }).catch(() => {});
            }

            liveActive = true;
            if (liveDisplay) liveDisplay.style.display = 'block';
            
            if (toggleBtn) {
                toggleBtn.classList.add('active');
                toggleBtn.innerHTML = `
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="5" y="5" width="14" height="14"></rect>
                    </svg>
                    Stop Live Translation
                `;
            }

            showToast('Live translation started!');
        } catch (error) {
            console.error('[Brief AI] Failed to start live translation:', error);
            showError('Failed to start live translation');
        } finally {
            setButtonLoading(toggleBtn, false);
        }
    }

    async function stopLiveTranslation() {
        const tabId = await getActiveTabId();
        const toggleBtn = $('#toggleLiveTranslate');
        const liveDisplay = $('#liveDisplay');

        try {
            if (tabId) {
                await chrome.tabs.sendMessage(tabId, { action: 'STOP_LIVE_TRANSLATION' }).catch(() => {});
            }
            await chrome.runtime.sendMessage({ action: 'STOP_AUDIO_CAPTURE' }).catch(() => {});
        } catch (e) {
            console.warn('[Brief AI] Stop live translation warning:', e);
        }

        liveActive = false;
        if (liveDisplay) liveDisplay.style.display = 'none';
        
        if (toggleBtn) {
            toggleBtn.classList.remove('active');
            toggleBtn.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
                Start Live Translation
            `;
        }

        showToast('Live translation stopped');
    }

    // ===== WORKER FEATURES (Coming Soon) =====
    function initWorkerFeatures() {
        // Shopping - Coming Soon
        const scanBtn = $('#scan-page-btn');
        scanBtn?.addEventListener('click', () => {
            showToast('Shopping Assistant coming soon!', 'info');
        });

        // Study - Coming Soon
        const studyBtn = $('#generate-study-btn');
        studyBtn?.addEventListener('click', () => {
            showToast('Study Assistant coming soon!', 'info');
        });
    }

    // ===== AI STATUS CHECK =====
    async function checkAIStatus() {
        try {
            const response = await chrome.runtime.sendMessage({ action: 'CHECK_AI_AVAILABILITY' });
            const indicator = $('#statusIndicator');
            const statusText = indicator?.querySelector('.status-text');

            if (!response?.success) {
                indicator?.classList.add('warning');
                if (statusText) statusText.textContent = 'Checking...';
                return;
            }

            const status = response.data || {};
            const values = Object.values(status);
            const total = values.length;
            const available = values.filter(s => s === 'available').length;
            const downloading = values.filter(s => s === 'downloading').length;

            if (available === total) {
                indicator?.classList.remove('warning', 'error');
                indicator?.classList.add('ready');
                if (statusText) statusText.textContent = 'AI Ready';
            } else if (downloading > 0) {
                indicator?.classList.add('warning');
                if (statusText) statusText.textContent = `Downloading... (${downloading}/${total})`;
                setTimeout(checkAIStatus, 5000);
            } else {
                indicator?.classList.add('warning');
                if (statusText) statusText.textContent = `${available}/${total} available`;
            }
        } catch (error) {
            console.error('[Brief AI] AI status check error:', error);
            const indicator = $('#statusIndicator');
            const statusText = indicator?.querySelector('.status-text');
            indicator?.classList.add('error');
            if (statusText) statusText.textContent = 'Error';
        }
    }

    // ===== CONTEXT MENU ACTIONS =====
    function listenForContextActions() {
        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace !== 'local') return;
            
            // Handle auth changes (for cross-window sync)
            if (changes.userAuth) {
                const auth = changes.userAuth.newValue;
                if (auth?.isAuthenticated) {
                    showUserInfo(auth);
                } else {
                    // User signed out
                    const authPrompt = $('#authPrompt');
                    const userInfo = $('#userInfo');
                    if (authPrompt) authPrompt.style.display = 'block';
                    if (userInfo) userInfo.style.display = 'none';
                }
            }
            
            // Handle context menu actions
            if (!changes.currentAction) return;

            const action = changes.currentAction.newValue;
            if (!action?.type) return;

            // Handle image description from context menu
            if (action.type === 'describeImage' && action.imageUrl) {
                console.log('[Brief AI] Image description requested:', action.imageUrl);
                
                // Switch to chat tab
                $$('.cat-pill').forEach(b => b.classList.remove('active'));
                $('[data-category="standard"]')?.classList.add('active');
                $$('.category-content').forEach(c => c.classList.remove('active'));
                $('#standard-category')?.classList.add('active');
                
                const container = $('#standard-category');
                const chatTab = container?.querySelector('.sub-tab[data-tab="chat"]');
                if (chatTab) chatTab.click();
                
                // Describe the image
                setTimeout(() => describeImageFromUrl(action.imageUrl), 200);
                
                chrome.storage.local.remove('currentAction');
                return;
            }

            if (!action.text) return;

            const tabMap = {
                summarize: 'summarize',
                translate: 'translate',
                proofread: 'proofread',
                promptAI: 'chat'
            };

            const inputMap = {
                summarize: 'summarize-input',
                translate: 'translate-input',
                proofread: 'proofread-input',
                promptAI: 'chat-input'
            };

            const tab = tabMap[action.type];
            const inputId = inputMap[action.type];

            if (!tab || !inputId) return;

            // Switch to Standard category
            $$('.cat-pill').forEach(b => b.classList.remove('active'));
            $('[data-category="standard"]')?.classList.add('active');
            
            $$('.category-content').forEach(c => c.classList.remove('active'));
            $('#standard-category')?.classList.add('active');

            // Switch to correct tab
            const container = $('#standard-category');
            const tabBtn = container?.querySelector(`.sub-tab[data-tab="${tab}"]`);
            if (tabBtn) tabBtn.click();

            // Set input value and trigger action
            const inputEl = document.getElementById(inputId);
            if (inputEl) {
                inputEl.value = action.text;
                
                setTimeout(() => {
                    if (action.type === 'summarize') {
                        $('#summarize-btn')?.click();
                    } else if (action.type === 'translate') {
                        handleRealtimeTranslate();
                    } else if (action.type === 'proofread') {
                        $('#proofread-btn')?.click();
                    } else if (action.type === 'promptAI') {
                        handleChatSend();
                    }
                }, 200);
            }

            // Clear the action
            chrome.storage.local.remove('currentAction');
        });
    }

    // ===== IMAGE DESCRIPTION =====
    async function describeImageFromUrl(imageUrl) {
        const container = $('#chat-messages');
        const welcome = container?.querySelector('.chat-welcome');
        if (welcome) welcome.remove();
        
        // Add user message with image preview
        const userDiv = document.createElement('div');
        userDiv.className = 'chat-message';
        userDiv.innerHTML = `
            <div class="message-user">
                <div class="message-content">
                    <img src="${escapeHtml(imageUrl)}" alt="Image" style="max-width: 200px; max-height: 150px; border-radius: 8px; margin-bottom: 8px; display: block;">
                    <span>🖼️ Describe this image</span>
                </div>
                <div class="message-time">${new Date().toLocaleTimeString()}</div>
            </div>
        `;
        container?.appendChild(userDiv);
        
        const thinkingId = addChatThinking();
        
        try {
            const response = await chrome.runtime.sendMessage({
                action: 'DESCRIBE_IMAGE',
                imageUrl: imageUrl,
                prompt: 'Describe this image in detail. What do you see? Include colors, objects, people, text, and any other relevant details. Respond in the same language as my request.'
            });
            
            removeChatThinking(thinkingId);
            
            if (response?.success && response?.data?.description) {
                addChatMessage(response.data.description, 'ai');
                showToast('Image described!');
            } else {
                showError(response?.error || 'Failed to describe image');
            }
        } catch (error) {
            removeChatThinking(thinkingId);
            showError('Image description failed: ' + error.message);
        }
    }

    // ===== IMAGE UPLOAD HANDLER =====
    function initImageUpload() {
        const uploadBtn = $('#upload-image-btn');
        const fileInput = $('#image-file-input');
        
        uploadBtn?.addEventListener('click', () => {
            fileInput?.click();
        });
        
        fileInput?.addEventListener('change', async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            
            if (!file.type.startsWith('image/')) {
                showError('Please select an image file');
                return;
            }
            
            // Convert to object URL and describe
            const imageUrl = URL.createObjectURL(file);
            await describeImageFromFile(file, imageUrl);
            fileInput.value = ''; // Reset input
        });
    }

    async function describeImageFromFile(file, previewUrl) {
        const container = $('#chat-messages');
        const welcome = container?.querySelector('.chat-welcome');
        if (welcome) welcome.remove();
        
        // Add user message with image preview
        const userDiv = document.createElement('div');
        userDiv.className = 'chat-message';
        userDiv.innerHTML = `
            <div class="message-user">
                <div class="message-content">
                    <img src="${previewUrl}" alt="Uploaded Image" style="max-width: 200px; max-height: 150px; border-radius: 8px; margin-bottom: 8px; display: block;">
                    <span>🖼️ Describe this uploaded image</span>
                </div>
                <div class="message-time">${new Date().toLocaleTimeString()}</div>
            </div>
        `;
        container?.appendChild(userDiv);
        if (container) container.scrollTop = container.scrollHeight;
        
        const thinkingId = addChatThinking();
        
        try {
            // Convert file to base64 for sending
            const base64 = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.readAsDataURL(file);
            });
            
            const response = await chrome.runtime.sendMessage({
                action: 'DESCRIBE_IMAGE',
                imageUrl: base64, // Send as base64 data URL
                prompt: 'Describe this image in detail. What do you see? Include colors, objects, people, text, and any other relevant details.'
            });
            
            removeChatThinking(thinkingId);
            
            if (response?.success && response?.data?.description) {
                addChatMessage(response.data.description, 'ai');
                showToast('Image described!');
            } else {
                showError(response?.error || 'Failed to describe image');
            }
        } catch (error) {
            removeChatThinking(thinkingId);
            showError('Image description failed: ' + error.message);
        } finally {
            URL.revokeObjectURL(previewUrl);
        }
    }

    // ===== START =====
    document.addEventListener('DOMContentLoaded', () => {
        init();
        initImageUpload();
    });
})();
