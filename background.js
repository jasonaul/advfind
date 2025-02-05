// Keep track of injected tabs
const injectedTabs = new Set();

// Listen for tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && 
        !tab.url.startsWith('chrome://') && 
        !injectedTabs.has(tabId)) {
        
        // Inject scripts one by one in sequence
        injectScriptsSequentially(tabId)
            .then(() => {
                console.log('All scripts injected successfully');
                injectedTabs.add(tabId);
                return chrome.tabs.sendMessage(tabId, { type: "INITIALIZE_CONTENT_SCRIPT" });
            })
            .catch(err => console.error('Failed to inject scripts:', err));
    }
});

async function injectScriptsSequentially(tabId) {
    const scripts = [
        'modules/config.js',
        'modules/dom-utils.js',
        'modules/search-utils.js',
        'modules/highlight-manager.js',
        'content.js'
    ];

    for (const script of scripts) {
        try {
            await chrome.scripting.executeScript({
                target: { tabId: tabId },
                files: [script]
            });
            console.log(`Injected ${script} successfully`);
        } catch (error) {
            console.error(`Failed to inject ${script}:`, error);
            throw error;
        }
    }
}

// Clean up injectedTabs when a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
    injectedTabs.delete(tabId);
});

// Handle messages with proper async response
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "CONTENT_SCRIPT_READY") {
        console.log("Content script ready in tab:", sender.tab?.id);
        sendResponse({ received: true });
    }
    // Important: Don't return true unless you're actually going to call sendResponse asynchronously
    return false;
});

// *** NEW: Create a context menu item on install ***
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "advanced-find-context-menu",
        title: "Advanced Find on this page",
        contexts: ["page"]
    });
});

// *** NEW: Listen for context menu clicks to toggle sidebar ***
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "advanced-find-context-menu" && tab.id) {
        chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_SIDEBAR" });
    }
});