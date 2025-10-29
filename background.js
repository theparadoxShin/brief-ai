chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "summarize",
        title: "Summarize Selection",
        contexts: ["selection"]
    });
});
chrome.contextMenus.onClicked.addListener( async (info, tab) => {
    if (info.menuItemId === "summarize" && info.selectionText) {
        const selectedText = info.selectionText;
        
        try {
            // Summarize the selected text using an AI API
            const translatedText = await summarizeText(selectedText);
            // Send the summarized text to the content script to play audio
            chrome.tabs.sendMessage(tab.id, { action: "PLAY_AUDIO", text: translatedText }); // @todo: create content script to handle this message
        } catch (error) {
            console.error("Error summarizing text:", error);
        }

    }
});

async function summarizeText(text) {
    // Call your AI summarization API here
    console.log("Summarizing text:", text);
    return "Summarized text";
}