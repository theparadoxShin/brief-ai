// Background Service Worker - Gestion des APIs AI et menu contextuel
import { AIService } from './services/ai-services.js';

const aiService = new AIService();

// Menu contextuel items
const MENU_ITEMS = [
    {
        id: "summarize",
        title: "📝 Summarize Selection",
        contexts: ["selection"]
    },
    {
        id: "translate",
        title: "🌐 Translate Selection",
        contexts: ["selection"]
    },
    {
        id: "detectLanguage",
        title: "🔍 Detect Language",
        contexts: ["selection"]
    },
    {
        id: "promptAI",
        title: "💬 Ask AI about this",
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
    
    if (!selectedText) {
        console.error('No text selected');
        return;
    }

    // Open side panel if not already open
    await chrome.sidePanel.open({ windowId: tab.windowId });

    // Send action to side panel
    const action = {
        type: info.menuItemId,
        text: selectedText,
        timestamp: Date.now()
    };

    // Save current action to storage
    await chrome.storage.local.set({ currentAction: action });

    // Process action based on type
    try {
        let result;
        
        switch (info.menuItemId) {
            case 'summarize':
                result = await aiService.summarize(selectedText);
                break;
            default:
                result = { error: 'Unknown action' };
        }

        // Save result
        await chrome.storage.local.set({
            lastResult: {
                action: info.menuItemId,
                input: selectedText,
                output: result,
                timestamp: Date.now()
            }
        });

    } catch (error) {
        console.error(`Error processing ${info.menuItemId}:`, error);
        await chrome.storage.local.set({ 
            lastResult: {
                action: info.menuItemId,
                input: selectedText,
                error: error.message,
                timestamp: Date.now()
            }
        });
    }
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

            default:
                sendResponse({ success: false, error: 'Unknown action' });
        }
    } catch (error) {
        console.error('Error handling message:', error);
        sendResponse({ success: false, error: error.message });
    }
}

// Gestion du clic sur l'icône de l'extension
chrome.action.onClicked.addListener(async (tab) => {
    await chrome.sidePanel.open({ windowId: tab.windowId });
});

console.log('Brief AI Background Service Worker loaded');