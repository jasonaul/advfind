// background.js

const readyTabs = new Set();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "CONTENT_SCRIPT_READY" && sender.tab?.id !== undefined) {
        readyTabs.add(sender.tab.id);
        sendResponse({ received: true });
        return false;
    }
    return false;
});

chrome.tabs.onRemoved.addListener((tabId) => {
    if (readyTabs.has(tabId)) {
        readyTabs.delete(tabId);
    }
});

chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "advanced-find-context-menu",
        title: "Toggle Advanced Find Sidebar",
        contexts: ["page"]
    });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "advanced-find-context-menu" && tab?.id !== undefined) {
        chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_SIDEBAR" }, () => void chrome.runtime.lastError);
    }
});
