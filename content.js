chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "PLAY_AUDIO" && request.text) {
        console.log("Received text to play audio:", request.text);

        return true; // Keep the message channel open for async response
    }
});