// Background Service Worker - Handles context menu, messages, and AI service interactions
import { AIService } from './services/ai-services.js';
import { ProofreaderService } from './services/proofreader-service.js';

const aiService = new AIService();
const proofreaderService = new ProofreaderService();

async function getActiveTabId() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs && tabs[0] ? tabs[0].id : null;
}

/**
 * MV3-compatible tab audio capture.
 * Returns a mediaStreamId that the caller (side panel) can use
 * with navigator.mediaDevices.getUserMedia() to obtain the actual stream.
 */
async function getTabCaptureStreamId() {
    const tabId = await getActiveTabId();
    if (!tabId) throw new Error('No active tab found');

    const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
    if (!streamId) throw new Error('Failed to get tab capture stream ID');
    return streamId;
}

// Context Menu Definitions
const MENU_ITEMS = [
    {
        id: "summarize",
        title: "📝 Summarize Selection",
        contexts: ["selection"]
    },
    {
        id: "translate",
        title: "🌍 Translate Selection",
        contexts: ["selection"]
    },
    {
        id: "proofread",
        title: "✏️ Fix Spelling & Grammar",
        contexts: ["selection"]
    },
    {
        id: "promptAI",
        title: "🤖 Ask AI about this",
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
    createContextMenus();
});

// Also create menus on service worker startup (for reloads)
createContextMenus();

function createContextMenus() {
    // Remove existing menus first to avoid duplicates
    chrome.contextMenus.removeAll(() => {
        // Create context menu items
        MENU_ITEMS.forEach(item => {
            chrome.contextMenus.create({
                id: item.id,
                title: item.title,
                contexts: item.contexts
            });
        });
        console.log('[Brief AI] Context menus created');
    });
}


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
    // Skip broadcast messages that use 'type' instead of 'action'
    // (e.g. LIVE_TRANSLATION_UPDATE from content scripts → side panel)
    if (!request.action) return;

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

            case 'GET_TAB_CAPTURE_STREAM_ID': {
                try {
                    const streamId = await getTabCaptureStreamId();
                    sendResponse({ success: true, streamId });
                } catch (e) {
                    console.error('GET_TAB_CAPTURE_STREAM_ID error:', e);
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

            case 'PROOFREAD': {
                try {
                    console.log('[Background] Proofreading text');
                    const result = await proofreaderService.proofread(
                        request.text,
                        request.language || 'en'
                    );
                    sendResponse({ success: true, data: result });
                } catch (e) {
                    console.error('PROOFREAD error:', e);
                    sendResponse({ success: false, error: e.message });
                }
                break;
            }

            case 'CHECK_PROOFREADER_AVAILABILITY': {
                try {
                    const availability = await proofreaderService.checkAvailability();
                    sendResponse({ success: true, data: availability });
                } catch (e) {
                    console.error('CHECK_PROOFREADER_AVAILABILITY error:', e);
                    sendResponse({ success: false, error: e.message });
                }
                break;
            }

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
    let disconnected = false;

    port.onDisconnect.addListener(() => {
        disconnected = true;
    });

    function safeSend(msg) {
        if (!disconnected) {
            try { port.postMessage(msg); } catch (e) { disconnected = true; }
        }
    }

    if (port.name === 'ai-chat-stream') {
        port.onMessage.addListener(async (msg) => {
            if (msg.action === 'PROMPT_AI_STREAM') {
                try {
                    // Use promptStream with callback for chunks
                    await aiService.promptStream(
                        msg.text,
                        (chunk) => {
                            safeSend({ type: 'chunk', chunk: chunk });
                        },
                        {} // No options needed, session remembers context
                    );

                    // Signal completion
                    safeSend({ type: 'done' });

                } catch (error) {
                    if (!disconnected) {
                        console.error('Streaming error:', error);
                        safeSend({ type: 'error', error: error.message });
                    }
                }
            } else if (msg.action === 'RESET_CHAT') {
                // Allow resetting the chat session
                try {
                    aiService.resetChatSession();
                    safeSend({ type: 'reset-complete' });
                } catch (error) {
                    console.error('Reset error:', error);
                    safeSend({ type: 'error', error: error.message });
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
                            safeSend({ type: 'chunk', chunk: chunk });
                        },
                        {} // No special options
                    );

                    // Signal completion
                    safeSend({ type: 'done' });

                } catch (error) {
                    if (!disconnected) {
                        console.error('Translation streaming error:', error);
                        safeSend({ type: 'error', error: error.message });
                    }
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