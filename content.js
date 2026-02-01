// Content Script - Live Translation for videos (captions-based)

class LiveTranslatorController {
    constructor() {
        this.active = false;
        this.targetLanguage = 'en';
        this.detectionMode = 'auto'; // 'auto' | 'captions-only' | 'audio-only'
        this.showOverlay = true;
        this.overlay = null;
        this.listeners = [];
        this.lastOriginal = '';
    }

    start(opts = {}) {
        if (this.active) return;
        this.active = true;
        this.targetLanguage = opts.targetLanguage || 'en';
        this.detectionMode = opts.detectionMode || 'auto';
        this.showOverlay = opts.showOverlay !== false;
        this.ensureOverlay();
        this.attachToVideos();
        this.postStatus('Live translation started');
    }

    stop() {
        this.active = false;
        this.detachFromVideos();
        this.removeOverlay();
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
            bottom: 8%;
            transform: translateX(-50%);
            background: rgba(0,0,0,0.65);
            color: #fff;
            padding: 8px 12px;
            border-radius: 8px;
            font-size: 16px;
            line-height: 1.4;
            z-index: 2147483647;
            max-width: 80vw;
            text-align: center;
            pointer-events: none;
            backdrop-filter: blur(2px);
        `;
        div.textContent = 'Waiting for captions…';
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
    }

    attachToVideos() {
        const videos = Array.from(document.querySelectorAll('video'));
        if (videos.length === 0) {
            this.postStatus('No video elements found on the page');
            this.setOverlayText('No video detected');
            return;
        }

        let totalTracks = 0;
        videos.forEach((video) => {
            // Attach to existing text tracks
            const tracks = Array.from(video.textTracks || []);
            totalTracks += tracks.length;
            for (const track of tracks) {
                try { track.mode = 'hidden'; } catch {}
                const onCue = () => this.handleCueChange(track);
                track.addEventListener('cuechange', onCue);
                this.listeners.push({ target: track, type: 'cuechange', handler: onCue });
            }

            // Listen for new tracks added later (e.g., when user enables CC)
            const onAddTrack = (ev) => {
                const newTrack = ev.track || (ev.detail && ev.detail.track);
                if (!newTrack) return;
                try { newTrack.mode = 'hidden'; } catch {}
                const onCue = () => this.handleCueChange(newTrack);
                newTrack.addEventListener('cuechange', onCue);
                this.listeners.push({ target: newTrack, type: 'cuechange', handler: onCue });
                this.postStatus('Captions detected');
                this.setOverlayText('Listening to captions…');
            };
            try {
                video.textTracks && video.textTracks.addEventListener('addtrack', onAddTrack);
                this.listeners.push({ target: video.textTracks, type: 'addtrack', handler: onAddTrack });
            } catch {}
        });

        // If no captions available and we're not in audio-only mode, hint the user
        if (totalTracks === 0 && this.detectionMode !== 'audio-only') {
            this.postStatus('No captions detected. Enable CC/subtitles on the video to translate.');
            this.setOverlayText('No captions detected. Turn on CC/subtitles to translate.');
        }
    }

    detachFromVideos() {
        this.listeners.forEach(({ target, type, handler }) => {
            try { target.removeEventListener(type, handler); } catch {}
        });
        this.listeners = [];
        this.lastOriginal = '';
    }

    async handleCueChange(track) {
        if (!this.active) return;
        const cues = Array.from(track.activeCues || []);
        if (!cues.length) return;
        const text = cues.map(c => (c.text || '').trim()).filter(Boolean).join('\n');
        if (!text || text === this.lastOriginal) return;
        this.lastOriginal = text;

        // Update side panel with original
        chrome.runtime.sendMessage({ type: 'LIVE_TRANSLATION_UPDATE', original: text });

        try {
            const resp = await chrome.runtime.sendMessage({
                action: 'TRANSLATE',
                text,
                targetLanguage: this.targetLanguage,
                sourceLanguage: 'auto',
                options: {}
            });
            if (resp && resp.success && resp.data && resp.data.translatedText) {
                const translated = resp.data.translatedText;
                // Update overlay and side panel
                if (this.showOverlay) this.setOverlayText(translated);
                chrome.runtime.sendMessage({
                    type: 'LIVE_TRANSLATION_UPDATE',
                    original: text,
                    translated,
                    detectedLanguage: resp.data.sourceLanguage || 'unknown'
                });
            }
        } catch (e) {
            console.warn('Translation failed', e);
        }
    }

    postStatus(message) {
        chrome.runtime.sendMessage({ type: 'LIVE_TRANSLATION_STATUS', message }).catch(()=>{});
    }
}

const LiveTranslator = new LiveTranslatorController();

// Listen for messages from background or side panel
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (!request || !request.action) return;
    if (request.action === 'START_LIVE_TRANSLATION') {
        LiveTranslator.start({
            targetLanguage: request.targetLanguage,
            detectionMode: request.detectionMode,
            showOverlay: request.showOverlay
        });
        sendResponse({ success: true });
    } else if (request.action === 'STOP_LIVE_TRANSLATION') {
        LiveTranslator.stop();
        sendResponse({ success: true });
    }
});

console.log('Brief AI content script loaded');
