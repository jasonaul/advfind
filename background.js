// background.js

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
                // No need to send INITIALIZE_CONTENT_SCRIPT, it initializes itself
            })
            .catch(err => console.error('Failed to inject scripts:', err));
    }
});

async function injectScriptsSequentially(tabId) {
    const scripts = [
        'lib/mark.min.js', // Include mark.js here
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
            throw error; // Important: Re-throw the error to stop the chain.
        }
    }
}

// Clean up injectedTabs when a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
    injectedTabs.delete(tabId);
});

// Handle messages (simplified - only for content script readiness)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "CONTENT_SCRIPT_READY") {
        console.log("Content script ready in tab:", sender.tab?.id);
        sendResponse({ received: true });
    }
    // Return false here. We're not sending any asynchronous responses *from background.js*.
    return false;
});

// Create a context menu item on install
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "advanced-find-context-menu",
        title: "Advanced Find on this page",
        contexts: ["page"]
    });
});

// Listen for context menu clicks to toggle sidebar
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "advanced-find-context-menu" && tab.id) {
        chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_SIDEBAR" });
    }
});