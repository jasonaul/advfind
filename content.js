(() => {
    let isContentScriptInjected = false;
    let highlightManager = null;

    // Initialize content script
    function initializeContentScript() {
        if (isContentScriptInjected) return;
        
        try {
            window.advancedFindDomUtils.injectHighlightStyle();
            highlightManager = new window.advancedFindHighlightManager();
            setupMessageListeners();
            
            isContentScriptInjected = true;
            console.log("Advanced Find Extension: Content script initialized successfully");
            chrome.runtime.sendMessage({ type: "CONTENT_SCRIPT_READY" });
        } catch (error) {
            console.error('Error initializing content script:', error);
        }
    }

    // Message handling setup
    function setupMessageListeners() {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (!highlightManager) {
                sendResponse({ success: false, error: "Highlight manager not initialized" });
                return true;
            }

            switch (request.type) {
                case "CHECK_INJECTION":
                    sendResponse({ injected: isContentScriptInjected });
                    break;

                case "SEARCH_TEXT":
                    handleSearchText(request, sendResponse);
                    break;

                case "NAVIGATE":
                    highlightManager.navigateMatches(request.payload.direction);
                    sendResponse({ success: true });
                    break;

                case "CLEAR_HIGHLIGHTS":
                    highlightManager.removeHighlights();
                    sendResponse({ success: true });
                    break;
            }

            return true;
        });
    }

    function handleSearchText(request, sendResponse) {
        const { searchTerm, searchTerm2, proximityValue, options } = request.payload;
    
        if (!searchTerm || searchTerm.trim() === "") {
            console.log("Empty search term received.");
            highlightManager.removeHighlights();
            sendResponse({ success: false, count: 0, error: "Search term is empty" });
            return;
        }
    
        try {
            let matchCount;
            if (options.proximitySearch && searchTerm2) {
                matchCount = highlightManager.highlightProximityMatches(
                    searchTerm,
                    searchTerm2,
                    proximityValue,
                    options.caseSensitive
                );
            } else {
                matchCount = highlightManager.highlightAndNavigateMatches(searchTerm, options, "none");
            }
            
            console.log(`Highlighted ${matchCount} instances`);
            sendResponse({ success: true, count: matchCount });
        } catch (error) {
            console.error("Error during text highlighting:", error);
            sendResponse({ success: false, error: "Error during text highlighting" });
        }
    }

    // Check if required modules are loaded
    function checkModules() {
        return window.advancedFindConfig && 
               window.advancedFindDomUtils && 
               window.advancedFindSearchUtils && 
               window.advancedFindHighlightManager;
    }

    // Initialize if modules are ready
    if (checkModules()) {
        initializeContentScript();
    } else {
        // Wait for modules to load
        const checkInterval = setInterval(() => {
            if (checkModules()) {
                clearInterval(checkInterval);
                initializeContentScript();
            }
        }, 50);

        // Clear interval after 5 seconds if modules haven't loaded
        setTimeout(() => {
            clearInterval(checkInterval);
            if (!isContentScriptInjected) {
                console.error('Failed to load required modules after timeout');
            }
        }, 5000);
    }
})();

window.advancedFindDomUtils.debugTextNodes();
