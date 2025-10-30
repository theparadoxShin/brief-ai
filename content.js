// Content Script - Minimal script for future enhancements

// Listen for messages from background or side panel
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Content script received message:', request);
    
    sendResponse({ success: true });
    return true;
});

console.log('Brief AI content script loaded');
