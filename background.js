// Background Service Worker - Handles context menu, messages, and AI service interactions
import { AIService } from './services/ai-services.js';

const aiService = new AIService();

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
    const selectedText = info.selectionText;
    console.log('Context menu clicked:', info, tab);
    
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