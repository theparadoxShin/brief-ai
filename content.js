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
    startYouTubeDetection() {
        console.log('[Brief AI] Starting YouTube caption detection');
        
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
        
        this.setOverlayText('🎬 Listening for Netflix captions...');
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
        
        this.setOverlayText('🎬 Listening for captions...\nEnable CC/subtitles on the video.');
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

        // Update side panel with original
        chrome.runtime.sendMessage({ 
            type: 'LIVE_TRANSLATION_UPDATE', 
            original: text 
        }).catch(() => {});

        // Show original while translating
        this.setOverlayText(`⏳ ${text}`);

        try {
            const resp = await chrome.runtime.sendMessage({
                action: 'TRANSLATE',
                text: text,
                targetLanguage: this.targetLanguage,
                sourceLanguage: 'auto',
                options: {}
            });

            if (resp?.success && resp?.data?.translatedText) {
                const translated = resp.data.translatedText;
                
                // Update overlay
                if (this.showOverlay) {
                    this.setOverlayText(translated);
                }
                
                // Update side panel
                chrome.runtime.sendMessage({
                    type: 'LIVE_TRANSLATION_UPDATE',
                    original: text,
                    translated: translated,
                    detectedLanguage: resp.data.sourceLanguage || 'auto'
                }).catch(() => {});
            }
        } catch (e) {
            console.warn('[Brief AI] Translation failed:', e);
        }
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
    
    if (request.action === 'START_LIVE_TRANSLATION') {
        console.log('[Brief AI] Received START_LIVE_TRANSLATION', request);
        LiveTranslator.start({
            targetLanguage: request.targetLanguage,
            detectionMode: request.detectionMode,
            showOverlay: request.showOverlay
        });
        sendResponse({ success: true });
    } else if (request.action === 'STOP_LIVE_TRANSLATION') {
        console.log('[Brief AI] Received STOP_LIVE_TRANSLATION');
        LiveTranslator.stop();
        sendResponse({ success: true });
    }
    
    return true; // Keep channel open for async
});

console.log('[Brief AI] Content script loaded on:', window.location.hostname);
