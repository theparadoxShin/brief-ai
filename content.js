// Content Script - Live Translation for videos
// Supports: YouTube, Netflix, Twitch, and generic HTML5 video captions

class LiveTranslatorController {
    constructor() {
        this.active = false;
        this.targetLanguage = 'en';
        this.detectionMode = 'auto'; // 'auto' | 'captions-only' | 'audio-only'
        this.showOverlay = true;
        this.overlay = null;
        this.listeners = [];
        this.lastOriginal = '';
        this.mutationObserver = null;
        this.platform = this.detectPlatform();
        this.debounceTimer = null;
        this.captionBuffer = '';
        this.captionPollInterval = null;
        this.captionFound = false; // true once first caption is detected
    }

    // Detect which platform we're on
    detectPlatform() {
        const hostname = window.location.hostname;
        if (hostname.includes('youtube.com')) return 'youtube';
        if (hostname.includes('netflix.com')) return 'netflix';
        if (hostname.includes('twitch.tv')) return 'twitch';
        if (hostname.includes('primevideo.com')) return 'primevideo';
        if (hostname.includes('disneyplus.com')) return 'disneyplus';
        return 'generic';
    }

    start(opts = {}) {
        if (this.active) return;
        this.active = true;
        this.targetLanguage = opts.targetLanguage || 'en';
        this.detectionMode = opts.detectionMode || 'auto';
        this.showOverlay = opts.showOverlay !== false;
        this.platform = this.detectPlatform();
        
        console.log(`[Brief AI] Starting live translation on ${this.platform}`);
        
        this.ensureOverlay();
        this.startCaptionDetection();
        this.postStatus(`Live translation started (${this.platform})`);
    }

    stop() {
        this.active = false;
        this.stopCaptionDetection();
        this.removeOverlay();
        this.lastOriginal = '';
        this.captionBuffer = '';
        this.captionFound = false;
        this.postStatus('Live translation stopped');
    }

    ensureOverlay() {
        if (!this.showOverlay) return;
        if (this.overlay && document.body.contains(this.overlay)) return;
        
        const div = document.createElement('div');
        div.id = 'brief-ai-overlay';
        div.style.cssText = `
            position: fixed;
            left: 50%;
            bottom: 10%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.85);
            color: #fff;
            padding: 12px 20px;
            border-radius: 12px;
            font-size: 18px;
            font-weight: 500;
            line-height: 1.5;
            z-index: 2147483647;
            max-width: 85vw;
            text-align: center;
            pointer-events: none;
            backdrop-filter: blur(4px);
            box-shadow: 0 4px 20px rgba(0,0,0,0.4);
            border: 1px solid rgba(255,255,255,0.1);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            transition: opacity 0.2s ease;
        `;
        div.textContent = '⏳ Waiting for captions…';
        document.body.appendChild(div);
        this.overlay = div;
    }

    removeOverlay() {
        if (this.overlay && this.overlay.parentNode) {
            this.overlay.remove();
        }
        this.overlay = null;
    }

    setOverlayText(text) {
        if (!this.overlay) return;
        this.overlay.textContent = text;
        this.overlay.style.opacity = '1';
    }

    // ===== CAPTION DETECTION (Platform-specific) =====
    startCaptionDetection() {
        switch (this.platform) {
            case 'youtube':
                this.startYouTubeDetection();
                break;
            case 'netflix':
                this.startNetflixDetection();
                break;
            case 'twitch':
                this.startTwitchDetection();
                break;
            default:
                this.startGenericDetection();
        }
    }

    stopCaptionDetection() {
        // Stop mutation observer
        if (this.mutationObserver) {
            this.mutationObserver.disconnect();
            this.mutationObserver = null;
        }
        
        // Stop caption polling
        if (this.captionPollInterval) {
            clearInterval(this.captionPollInterval);
            this.captionPollInterval = null;
        }
        
        // Clear listeners
        this.listeners.forEach(({ target, type, handler }) => {
            try { target.removeEventListener(type, handler); } catch {}
        });
        this.listeners = [];
        
        // Clear debounce timer
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
    }

    // ===== YOUTUBE SPECIFIC =====

    /**
     * Try to auto-enable CC on YouTube if not already active.
     * The CC button has aria-pressed="true" when active.
     */
    enableYouTubeCaptions() {
        const ccBtn = document.querySelector('.ytp-subtitles-button');
        if (!ccBtn) {
            console.log('[Brief AI] YouTube CC button not found');
            return false;
        }
        if (ccBtn.getAttribute('aria-pressed') === 'true') {
            console.log('[Brief AI] YouTube CC already enabled');
            return true;
        }
        ccBtn.click();
        console.log('[Brief AI] Auto-enabled YouTube captions');
        return true;
    }

    /**
     * Periodic poll that re-checks for caption DOM elements.
     * Acts as a fallback if MutationObserver misses updates.
     */
    startCaptionPolling() {
        if (this.captionPollInterval) return;
        let pollCount = 0;
        const maxPolls = 60; // 2s × 60 = 2 minutes max

        this.captionPollInterval = setInterval(() => {
            pollCount++;
            if (!this.active || pollCount > maxPolls) {
                clearInterval(this.captionPollInterval);
                this.captionPollInterval = null;
                if (pollCount > maxPolls && !this.captionFound) {
                    this.setOverlayText('⚠️ No captions detected.\nEnable CC/subtitles on the video.');
                    this.postStatus('No captions detected. Enable CC/subtitles on the video.');
                }
                return;
            }

            // Platform-specific poll
            if (this.platform === 'youtube') {
                // Re-try auto-enabling CC if no caption found yet
                if (!this.captionFound) {
                    this.enableYouTubeCaptions();
                }
                this.checkAllYouTubeCaptions();
            } else if (this.platform === 'netflix') {
                this.checkAllNetflixCaptions();
            } else {
                this.checkGenericCaptions();
            }
        }, 2000);
    }

    startYouTubeDetection() {
        console.log('[Brief AI] Starting YouTube caption detection');
        
        // Try to auto-enable CC
        this.enableYouTubeCaptions();

        // YouTube caption selectors (they change frequently, so we use multiple)
        const captionSelectors = [
            '.ytp-caption-segment',           // Main caption segments
            '.captions-text',                 // Alternative
            '.ytp-caption-window-container',  // Container
            '.caption-visual-line',           // Visual line
            '.ytp-caption-window-bottom',     // Bottom captions
        ];

        // Create mutation observer for YouTube
        this.mutationObserver = new MutationObserver((mutations) => {
            if (!this.active) return;
            
            for (const mutation of mutations) {
                // Check added nodes
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        this.checkYouTubeCaptions(node);
                    }
                }
                
                // Check for text content changes
                if (mutation.type === 'characterData' || mutation.type === 'childList') {
                    this.checkYouTubeCaptions(mutation.target);
                }
            }
        });

        // Observe the entire document for caption changes
        this.mutationObserver.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true,
            characterDataOldValue: true
        });

        // Also try HTML5 textTracks as fallback
        this.attachToVideoTracks();
        
        // Initial check
        this.checkAllYouTubeCaptions();

        // Start periodic polling as backup
        this.startCaptionPolling();
        
        this.setOverlayText('🎬 Listening for YouTube captions...\nMake sure CC is enabled!');
    }

    checkYouTubeCaptions(element) {
        if (!element) return;
        
        // Get the element to search in
        const searchEl = element.nodeType === Node.TEXT_NODE ? element.parentElement : element;
        if (!searchEl) return;

        // Look for caption segments
        const captionSegments = searchEl.querySelectorAll?.('.ytp-caption-segment') || [];
        let captionText = '';

        if (captionSegments.length > 0) {
            captionText = Array.from(captionSegments)
                .map(seg => seg.textContent?.trim())
                .filter(Boolean)
                .join(' ');
        } else if (searchEl.classList?.contains('ytp-caption-segment')) {
            captionText = searchEl.textContent?.trim();
        }

        if (captionText && captionText !== this.lastOriginal && captionText.length > 1) {
            this.handleDetectedCaption(captionText);
        }
    }

    checkAllYouTubeCaptions() {
        const segments = document.querySelectorAll('.ytp-caption-segment');
        if (segments.length > 0) {
            const text = Array.from(segments)
                .map(seg => seg.textContent?.trim())
                .filter(Boolean)
                .join(' ');
            if (text && text !== this.lastOriginal) {
                this.handleDetectedCaption(text);
            }
        }
    }

    // ===== NETFLIX SPECIFIC =====
    startNetflixDetection() {
        console.log('[Brief AI] Starting Netflix caption detection');
        
        this.mutationObserver = new MutationObserver((mutations) => {
            if (!this.active) return;
            
            // Netflix uses .player-timedtext-text-container for subtitles
            const containers = document.querySelectorAll('.player-timedtext-text-container span');
            if (containers.length > 0) {
                const text = Array.from(containers)
                    .map(el => el.textContent?.trim())
                    .filter(Boolean)
                    .join(' ');
                if (text && text !== this.lastOriginal) {
                    this.handleDetectedCaption(text);
                }
            }
        });

        this.mutationObserver.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true
        });
        
        // Start periodic polling as backup
        this.startCaptionPolling();

        this.setOverlayText('🎬 Listening for Netflix captions...');
    }

    checkAllNetflixCaptions() {
        const containers = document.querySelectorAll('.player-timedtext-text-container span');
        if (containers.length > 0) {
            const text = Array.from(containers)
                .map(el => el.textContent?.trim())
                .filter(Boolean)
                .join(' ');
            if (text && text !== this.lastOriginal) {
                this.handleDetectedCaption(text);
            }
        }
    }

    // ===== TWITCH SPECIFIC =====
    startTwitchDetection() {
        console.log('[Brief AI] Starting Twitch caption detection');
        
        // Twitch uses various caption implementations
        this.mutationObserver = new MutationObserver((mutations) => {
            if (!this.active) return;
            
            const captionEls = document.querySelectorAll('[data-a-target="player-overlay-click-handler"] ~ div');
            // Also check for extension-based captions
            const extensionCaptions = document.querySelectorAll('.captions-container, .caption-line');
            
            const allCaptions = [...captionEls, ...extensionCaptions];
            if (allCaptions.length > 0) {
                const text = Array.from(allCaptions)
                    .map(el => el.textContent?.trim())
                    .filter(Boolean)
                    .join(' ');
                if (text && text !== this.lastOriginal && text.length > 2) {
                    this.handleDetectedCaption(text);
                }
            }
        });

        this.mutationObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
        
        this.setOverlayText('🎬 Listening for Twitch captions...');
    }

    // ===== GENERIC HTML5 VIDEO =====
    startGenericDetection() {
        console.log('[Brief AI] Starting generic caption detection');
        
        // Attach to HTML5 video textTracks
        this.attachToVideoTracks();
        
        // Also use mutation observer for custom caption implementations
        this.mutationObserver = new MutationObserver((mutations) => {
            if (!this.active) return;
            
            const captionSelectors = [
                '[class*="caption"]',
                '[class*="subtitle"]',
                '.vjs-text-track-display',
                '.jw-captions',
                '.plyr__captions'
            ];
            
            for (const selector of captionSelectors) {
                const els = document.querySelectorAll(selector);
                if (els.length > 0) {
                    const text = Array.from(els)
                        .map(el => el.textContent?.trim())
                        .filter(Boolean)
                        .join(' ');
                    if (text && text !== this.lastOriginal && text.length > 2) {
                        this.handleDetectedCaption(text);
                        break;
                    }
                }
            }
        });

        this.mutationObserver.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true
        });
        
        // Start periodic polling as backup
        this.startCaptionPolling();

        this.setOverlayText('🎬 Listening for captions...\nEnable CC/subtitles on the video.');
    }

    checkGenericCaptions() {
        const selectors = [
            '[class*="caption"]', '[class*="subtitle"]',
            '.vjs-text-track-display', '.jw-captions', '.plyr__captions'
        ];
        for (const selector of selectors) {
            const els = document.querySelectorAll(selector);
            if (els.length > 0) {
                const text = Array.from(els)
                    .map(el => el.textContent?.trim())
                    .filter(Boolean)
                    .join(' ');
                if (text && text !== this.lastOriginal && text.length > 2) {
                    this.handleDetectedCaption(text);
                    break;
                }
            }
        }
    }

    // ===== HTML5 VIDEO TRACKS (Fallback) =====
    attachToVideoTracks() {
        const videos = Array.from(document.querySelectorAll('video'));
        if (videos.length === 0) {
            console.log('[Brief AI] No video elements found');
            return;
        }

        console.log(`[Brief AI] Found ${videos.length} video element(s)`);

        videos.forEach((video) => {
            const tracks = Array.from(video.textTracks || []);
            console.log(`[Brief AI] Video has ${tracks.length} text tracks`);
            
            for (const track of tracks) {
                try { track.mode = 'hidden'; } catch {}
                const onCue = () => this.handleCueChange(track);
                track.addEventListener('cuechange', onCue);
                this.listeners.push({ target: track, type: 'cuechange', handler: onCue });
            }

            // Listen for new tracks
            if (video.textTracks) {
                const onAddTrack = (ev) => {
                    const newTrack = ev.track;
                    if (!newTrack) return;
                    console.log('[Brief AI] New track added:', newTrack.kind, newTrack.language);
                    try { newTrack.mode = 'hidden'; } catch {}
                    const onCue = () => this.handleCueChange(newTrack);
                    newTrack.addEventListener('cuechange', onCue);
                    this.listeners.push({ target: newTrack, type: 'cuechange', handler: onCue });
                };
                video.textTracks.addEventListener('addtrack', onAddTrack);
                this.listeners.push({ target: video.textTracks, type: 'addtrack', handler: onAddTrack });
            }
        });
    }

    handleCueChange(track) {
        if (!this.active) return;
        const cues = Array.from(track.activeCues || []);
        if (!cues.length) return;
        
        const text = cues
            .map(c => (c.text || '').replace(/<[^>]*>/g, '').trim())
            .filter(Boolean)
            .join(' ');
        
        if (text && text !== this.lastOriginal) {
            this.handleDetectedCaption(text);
        }
    }

    // ===== HANDLE DETECTED CAPTION =====
    handleDetectedCaption(text) {
        if (!text || text === this.lastOriginal) return;
        
        // Mark that we found captions (stops retry polling)
        if (!this.captionFound) {
            this.captionFound = true;
            console.log('[Brief AI] First caption detected!');
        }

        // Debounce rapid changes
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
            this.processCaption(text);
        }, 150);
    }

    async processCaption(text) {
        if (!this.active || !text) return;
        
        this.lastOriginal = text;
        console.log('[Brief AI] Caption detected:', text.substring(0, 50) + '...');

        // Show original in overlay while translating
        this.setOverlayText(`⏳ ${text}`);

        let translated = null;
        let detectedLanguage = 'auto';

        try {
            const resp = await chrome.runtime.sendMessage({
                action: 'TRANSLATE',
                text: text,
                targetLanguage: this.targetLanguage,
                sourceLanguage: 'auto',
                options: {}
            });

            if (resp?.success && resp?.data?.translatedText) {
                translated = resp.data.translatedText;
                detectedLanguage = resp.data.sourceLanguage || 'auto';
                
                // Update overlay with translation
                if (this.showOverlay) {
                    this.setOverlayText(translated);
                }
            }
        } catch (e) {
            console.warn('[Brief AI] Translation failed:', e);
        }

        // Send a SINGLE update to side panel with both original + translated
        chrome.runtime.sendMessage({
            type: 'LIVE_TRANSLATION_UPDATE',
            original: text,
            translated: translated || text,
            detectedLanguage: detectedLanguage
        }).catch(() => {});
    }

    postStatus(message) {
        chrome.runtime.sendMessage({ 
            type: 'LIVE_TRANSLATION_STATUS', 
            message 
        }).catch(() => {});
    }
}

// ===== INITIALIZE =====
const LiveTranslator = new LiveTranslatorController();

// Listen for messages from background or side panel
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (!request || !request.action) return;

    if (request.action === 'PING') {
        sendResponse({ pong: true });
        return;
    }
    
    if (request.action === 'START_LIVE_TRANSLATION') {
        console.log('[Brief AI] Received START_LIVE_TRANSLATION', request);
        LiveTranslator.start({
            targetLanguage: request.targetLanguage,
            detectionMode: request.detectionMode,
            showOverlay: request.showOverlay
        });
        sendResponse({ success: true });
        return true;
    } else if (request.action === 'STOP_LIVE_TRANSLATION') {
        console.log('[Brief AI] Received STOP_LIVE_TRANSLATION');
        LiveTranslator.stop();
        sendResponse({ success: true });
        return true;
    }
});

console.log('[Brief AI] Content script loaded on:', window.location.hostname);
