// Background Service Worker - Handles context menu, messages, and AI service interactions
import { AIService } from './services/ai-services.js';

const aiService = new AIService();

// State for tab audio capture
let audioCapture = {
    stream: null,
    audioCtx: null,
    source: null,
    analyser: null,
    meterInterval: null,
};

async function getActiveTabId() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs && tabs[0] ? tabs[0].id : null;
}

async function startTabAudioCapture() {
    if (audioCapture.stream) {
        // Already capturing
        chrome.runtime.sendMessage({ type: 'LIVE_AUDIO_STATUS', message: 'Tab audio capture already active' }).catch(()=>{});
        return { ok: true };
    }

    const tabId = await getActiveTabId();
    if (!tabId) throw new Error('No active tab found');

    const stream = await new Promise((resolve, reject) => {
        try {
            chrome.tabCapture.capture({
                audio: true,
                video: false,
                targetTabId: tabId
            }, (capturedStream) => {
                const err = chrome.runtime.lastError;
                if (err) return reject(new Error(err.message || 'tabCapture failed'));
                if (!capturedStream) return reject(new Error('No stream captured'));
                resolve(capturedStream);
            });
        } catch (e) {
            reject(e);
        }
    });

    const audioCtx = new (self.AudioContext || self.webkitAudioContext)();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    // Also route to destination so user still hears audio
    source.connect(audioCtx.destination);

    const dataArray = new Uint8Array(analyser.fftSize);
    const updateMeter = () => {
        analyser.getByteTimeDomainData(dataArray);
        // Compute RMS
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
            const v = (dataArray[i] - 128) / 128; // [-1,1]
            sum += v * v;
        }
        const rms = Math.sqrt(sum / dataArray.length); // 0..1
        const level = Math.min(1, Math.max(0, rms * 1.8));
        chrome.runtime.sendMessage({ type: 'LIVE_AUDIO_LEVELS', level }).catch(()=>{});
    };
    const meterInterval = setInterval(updateMeter, 120);

    audioCapture = { stream, audioCtx, source, analyser, meterInterval };
    chrome.runtime.sendMessage({ type: 'LIVE_AUDIO_STATUS', message: 'Tab audio capture started' }).catch(()=>{});
    return { ok: true };
}

async function stopTabAudioCapture() {
    if (audioCapture.meterInterval) {
        clearInterval(audioCapture.meterInterval);
    }
    if (audioCapture.source) {
        try { audioCapture.source.disconnect(); } catch {}
    }
    if (audioCapture.analyser) {
        try { audioCapture.analyser.disconnect(); } catch {}
    }
    if (audioCapture.audioCtx) {
        try { await audioCapture.audioCtx.close(); } catch {}
    }
    if (audioCapture.stream) {
        try { audioCapture.stream.getTracks().forEach(t => t.stop()); } catch {}
    }
    audioCapture = { stream: null, audioCtx: null, source: null, analyser: null, meterInterval: null };
    chrome.runtime.sendMessage({ type: 'LIVE_AUDIO_STATUS', message: 'Tab audio capture stopped' }).catch(()=>{});
    return { ok: true };
}

// Context Menu Definitions
const MENU_ITEMS = [
    {
        id: "summarize",
        title: "Summarize Selection",
        contexts: ["selection"]
    },
    {
        id: "translate",
        title: "Translate Selection",
        contexts: ["selection"]
    },
    {
        id: "promptAI",
        title: "Ask AI about this",
        contexts: ["selection"]
    },
    {
        id: "describeImage",
        title: "🖼️ Describe this Image (AI)",
        contexts: ["image"]
    }
];

// Create context menu on installation
chrome.runtime.onInstalled.addListener(() => {

    // Create context menu items
        MENU_ITEMS.forEach(item => {
        chrome.contextMenus.create({
            id: item.id,
            title: item.title,
            contexts: item.contexts
        });
    });
});


// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    console.log('Context menu clicked:', info, tab);
    
    // Handle image description
    if (info.menuItemId === 'describeImage' && info.srcUrl) {
        console.log('Describing image:', info.srcUrl);
        
        // Open side panel
        await chrome.sidePanel.open({ windowId: tab.windowId });
        
        // Send image action to sidepanel
        setTimeout(async () => {
            await chrome.storage.local.set({
                currentAction: {
                    type: 'describeImage',
                    imageUrl: info.srcUrl,
                    timestamp: Date.now()
                }
            });
        }, 100);
        return;
    }
    
    const selectedText = info.selectionText;
    
    if (!selectedText) {
        console.error('No text selected');
        return;
    }

    // Open side panel if not already open
    await chrome.sidePanel.open({ windowId: tab.windowId });

    // Send action to side panel with a small delay to ensure sidepanel is loaded
    const action = {
        type: info.menuItemId,
        text: selectedText,
        timestamp: Date.now()
    };

    // Small delay to ensure sidepanel is fully loaded before sending action
    setTimeout(async () => {
        console.log('Sending action to sidepanel:', action);
        await chrome.storage.local.set({ currentAction: action });
    }, 100);
});

// Listen for messages from content scripts or side panel
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    handleMessage(request, sender, sendResponse);
    return true; // Keep channel open for async response
});

// Handle incoming messages
async function handleMessage(request, sender, sendResponse) {
    try {
        switch (request.action) {
            case 'CHECK_AI_AVAILABILITY':
                const availability = await aiService.checkAvailability();
                sendResponse({ success: true, data: availability }); // Respond with availability data
                break;

            case 'SET_CLOUD_MODEL': {
                try {
                    aiService.selectedModel = request.model || 'gemini-1.5-flash';
                    await chrome.storage.local.set({ selectedModel: aiService.selectedModel });
                    console.log('[Background] Cloud model set to:', aiService.selectedModel);
                    sendResponse({ success: true });
                } catch (e) {
                    sendResponse({ success: false, error: e.message });
                }
                break;
            }

            case 'SUMMARIZE': 
                const summaryResult = await aiService.summarize(request.text, request.options);
                sendResponse({ success: true, data: summaryResult });
                break;

            case 'TRANSLATE':
                console.log('Handling TRANSLATE request:', request);
                const translateResult = await aiService.translate(
                    request.text, 
                    request.targetLanguage, 
                    request.sourceLanguage,
                    request.options || {}
                );
                sendResponse({ success: true, data: translateResult });
                break;
            
            case 'PROMPT_AI': {
                const opts = request.options || {};
                // Map legacy 'context' string to initialPrompts as system content
                if (request.context && typeof request.context === 'string') {
                    opts.initialPrompts = [
                        { role: 'system', content: request.context }
                    ];
                }
                const promptResult = await aiService.prompt(request.text, opts);
                sendResponse({ success: true, data: promptResult });
                break;
            }

            case 'SET_AI_MODE': {
                try {
                    await aiService.setAIMode(request.mode === 'online' ? 'online' : 'local');
                    sendResponse({ success: true });
                } catch (e) {
                    sendResponse({ success: false, error: e.message });
                }
                break;
            }

            case 'START_AUDIO_CAPTURE': {
                try {
                    const res = await startTabAudioCapture();
                    sendResponse({ success: true, data: res });
                } catch (e) {
                    console.error('START_AUDIO_CAPTURE error:', e);
                    sendResponse({ success: false, error: e.message });
                }
                break;
            }

            case 'STOP_AUDIO_CAPTURE': {
                try {
                    const res = await stopTabAudioCapture();
                    sendResponse({ success: true, data: res });
                } catch (e) {
                    console.error('STOP_AUDIO_CAPTURE error:', e);
                    sendResponse({ success: false, error: e.message });
                }
                break;
            }

            case 'DESCRIBE_IMAGE': {
                try {
                    console.log('[Background] Describing image:', request.imageUrl);
                    const description = await aiService.describeImage(request.imageUrl, request.prompt);
                    sendResponse({ success: true, data: description });
                } catch (e) {
                    console.error('DESCRIBE_IMAGE error:', e);
                    sendResponse({ success: false, error: e.message });
                }
                break;
            }

            case 'VERTEX_AI_CONNECTED':
                console.log('Vertex AI connected:', request.config);
                // Reinitialize AI service to pick up new config
                await aiService.initVertexAI();
                sendResponse({ success: true });
                break;

            case 'VERTEX_AI_DISCONNECTED':
                console.log('Vertex AI disconnected');
                // Clear Vertex AI config
                aiService.vertexAI = null;
                sendResponse({ success: true });
                break;

            default:
                sendResponse({ success: false, error: 'Unknown action' });
        }
    } catch (error) {
        console.error('Error handling message:', error);
        sendResponse({ success: false, error: error.message });
    }
}

// Handle streaming connections for AI chat and translation
chrome.runtime.onConnect.addListener((port) => {
    if (port.name === 'ai-chat-stream') {
        port.onMessage.addListener(async (msg) => {
            if (msg.action === 'PROMPT_AI_STREAM') {
                try {
                    // Use promptStream with callback for chunks
                    await aiService.promptStream(
                        msg.text,
                        (chunk) => {
                            // Send each chunk to the side panel
                            port.postMessage({ type: 'chunk', chunk: chunk });
                        },
                        {} // No options needed, session remembers context
                    );

                    // Signal completion
                    port.postMessage({ type: 'done' });

                } catch (error) {
                    console.error('Streaming error:', error);
                    port.postMessage({ type: 'error', error: error.message });
                }
            } else if (msg.action === 'RESET_CHAT') {
                // Allow resetting the chat session
                try {
                    aiService.resetChatSession();
                    port.postMessage({ type: 'reset-complete' });
                } catch (error) {
                    console.error('Reset error:', error);
                    port.postMessage({ type: 'error', error: error.message });
                }
            }
        });
    } else if (port.name === 'translate-stream') {
        port.onMessage.addListener(async (msg) => {
            if (msg.action === 'TRANSLATE_STREAM') {
                try {
                    // Use translateStream with callback for chunks
                    await aiService.translateStream(
                        msg.text,
                        msg.targetLanguage,
                        msg.sourceLanguage,
                        (chunk) => {
                            // Send each chunk to the side panel
                            port.postMessage({ type: 'chunk', chunk: chunk });
                        },
                        {} // No special options
                    );

                    // Signal completion
                    port.postMessage({ type: 'done' });

                } catch (error) {
                    console.error('Translation streaming error:', error);
                    port.postMessage({ type: 'error', error: error.message });
                }
            }
        });
    }
});

// Open side panel on extension icon click
chrome.action.onClicked.addListener(async (tab) => {
    await chrome.sidePanel.open({ windowId: tab.windowId });
});

console.log('Brief AI Background Service Worker loaded');