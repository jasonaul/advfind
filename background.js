// background.js

// Keep track of injected tabs
const injectedTabs = new Set();

   // Listen for tab updates (Inject on 'complete' status)
   chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // Ensure injection happens only once per full page load/update
    if (changeInfo.status === 'complete' && tab.url && shouldInject(tab.url) && !injectedTabs.has(tabId)) {
        console.log(`Tab ${tabId} updated to complete status. URL: ${tab.url}. Injecting scripts.`);
        injectScriptsSequentially(tabId)
            .then(() => {
                console.log(`Scripts potentially injected or verified in tab ${tabId}`);
                injectedTabs.add(tabId);
                 // Maybe send a PING after injection attempt? Content script sends READY anyway.
            })
            .catch(err => {
                 console.error(`Failed to inject scripts into tab ${tabId}:`, err.message);
                 // Remove from injectedTabs if injection failed? Maybe not, let content script confirm.
             });
    } else if (changeInfo.status === 'loading') {
         // If tab starts loading, remove it from the set to allow re-injection on completion
         if (injectedTabs.has(tabId)) {
             console.log(`Tab ${tabId} started loading, removing from injected set for potential re-injection.`);
             injectedTabs.delete(tabId);
         }
    }
});

/**
 * Checks if the URL is suitable for script injection.
 * @param {string} url - The URL to check.
 * @returns {boolean} True if injection is allowed, false otherwise.
 */
function shouldInject(url) {
    if (!url) return false;
    // Block chrome://, edge://, about:, data:, javascript:, etc.
    // Allow http, https, file
     const blockedPrefixes = ['chrome://', 'edge://', 'about:', 'data:', 'javascript:', 'chrome-extension://'];
     const allowedPrefixes = ['http://', 'https://', 'file://'];

     if (blockedPrefixes.some(prefix => url.startsWith(prefix))) {
         return false;
     }
     // Allow specified protocols or if it's a relative path (less likely for top-level tabs)
    return allowedPrefixes.some(prefix => url.startsWith(prefix)) || !url.includes('://');
}


/**
 * Injects content scripts sequentially into a given tab.
 * @param {number} tabId - The ID of the tab to inject into.
 */
async function injectScriptsSequentially(tabId) {
    // Define the order of scripts
    const scripts = [
        'lib/mark.min.js',
        'modules/config.js',
        'modules/dom-utils.js',
        'modules/search-utils.js',
        'modules/highlight-manager.js',
        'modules/persistent-highlights.js',
        // Export module doesn't need injection if only used by popup
        // 'modules/export-highlights.js',
        'content.js' // content.js must be last
    ];

    for (const script of scripts) {
        try {
            await chrome.scripting.executeScript({
                target: { tabId: tabId },
                files: [script]
            });
             // console.log(`Successfully injected ${script} into tab ${tabId}`); // Reduce logging verbosity
        } catch (error) {
            // Don't throw immediately, log the error and continue if possible?
            // Or re-throw to stop the chain? Let's re-throw for now.
             console.warn(`Failed to inject ${script} into tab ${tabId}: ${error.message}`);
             // Check for specific non-critical errors vs critical ones
            if (error.message.includes("Cannot access") || error.message.includes("extension context invalidated")) {
                // These might indicate the tab is gone or inaccessible, stop injection.
                throw error;
            }
             // For other errors (like script execution errors), maybe continue? Risky.
             // Let's assume failure is critical for now.
             throw error; // Re-throw to signal failure
        }
    }
     console.log(`Finished script injection sequence for tab ${tabId}.`);
}

// Clean up injectedTabs when a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
    if (injectedTabs.has(tabId)) {
        injectedTabs.delete(tabId);
        console.log(`Tab ${tabId} closed, removed from injected set.`);
    }
});

// Listen for messages (e.g., from content script)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "CONTENT_SCRIPT_READY") {
        console.log(`Background: Received CONTENT_SCRIPT_READY from tab ${sender.tab?.id}`);
        // Mark tab as ready? Already handled by injectedTabs set mostly.
         if (sender.tab && sender.tab.id) {
             injectedTabs.add(sender.tab.id); // Ensure it's marked if injection succeeded
         }
        sendResponse({ received: true });
    }
    // Add other message handlers if background needs to do more
    // Example: Relay message from popup to all content scripts?

    // Important: Return true if sendResponse will be called asynchronously.
    // For CONTENT_SCRIPT_READY, it's synchronous here.
    return false;
});


// --- Context Menu ---
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "advanced-find-context-menu",
        title: "Toggle Advanced Find Sidebar", // Changed title
        contexts: ["page"]
    });
     console.log("Context menu created.");
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "advanced-find-context-menu" && tab && tab.id) {
         // Send message to content script to toggle its sidebar UI or state
         // This assumes the content script manages the sidebar visibility/state
         chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_SIDEBAR" }, (response) => {
            if (chrome.runtime.lastError) {
                 console.warn(`Error sending TOGGLE_SIDEBAR to tab ${tab.id}: ${chrome.runtime.lastError.message}. Maybe content script not ready?`);
                 // Optionally try to inject scripts if connection failed? Risky.
             } else {
                 console.log("TOGGLE_SIDEBAR message sent, response:", response);
             }
         });
    }
});

console.log("Advanced Find Background Script Loaded.");