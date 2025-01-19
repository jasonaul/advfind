chrome.runtime.onInstalled.addListener(() => {
    console.log('Advanced Find Extension installed');
});

// Keep track of injected tabs
const injectedTabs = new Set();

// Listen for tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && 
        !tab.url.startsWith('chrome://') && 
        !injectedTabs.has(tabId)) {
        
        // Inject all required scripts in sequence
        const scripts = [
            'modules/config.js',
            'modules/dom-utils.js',
            'modules/search-utils.js',
            'modules/highlight-manager.js',
            'content.js'
        ];

        Promise.all(scripts.map(file => 
            chrome.scripting.executeScript({
                target: { tabId: tabId },
                files: [file]
            })
        ))
        .then(() => {
            console.log('All scripts injected successfully');
            injectedTabs.add(tabId);
            // Notify the content script that it should initialize
            return chrome.tabs.sendMessage(tabId, { type: "INITIALIZE_CONTENT_SCRIPT" });
        })
        .catch(err => console.error('Failed to inject scripts:', err));
    }
});

// Clean up injectedTabs when a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
    injectedTabs.delete(tabId);
});

// Listen for messages from content script with proper async handling
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "CONTENT_SCRIPT_READY") {
        console.log("Content script ready in tab:", sender.tab?.id);
        sendResponse({ received: true });
    }
    return false; // Don't keep the message channel open
});