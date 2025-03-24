
// /modules/live-search.js

(() => {
    let activeTabId = null;
    let contentScriptReady = false;
    let lastSearchTerm = "";
    let debounceTimer;

    // Function to initialize live search module
    function initializeLiveSearch(tabId, isReady) {
        activeTabId = tabId;
        contentScriptReady = isReady;
        setupLiveSearchEventListeners();
    }

    function setContentScriptReady(ready) {
        contentScriptReady = ready;
    }

    function setupLiveSearchEventListeners() {
        const searchInput = document.getElementById("searchTermInput");
        if (!searchInput) {
            console.error("Search input field not found!");
            return;
        }

        searchInput.addEventListener('input', (event) => {
            const searchTerm = event.target.value.trim();
            if (searchTerm === lastSearchTerm) return; // Prevent re-search if term hasn't changed
            lastSearchTerm = searchTerm;

            clearTimeout(debounceTimer); // Clear previous debounce timer

            debounceTimer = setTimeout(() => {
                if (searchTerm) {
                    performLiveSearch(searchTerm);
                } else {
                    clearHighlights(); // Clear highlights if input is empty
                }
            }, 200); // Debounce delay of 200ms (adjust as needed)
        });
    }

    function performLiveSearch(searchTerm) {
        if (!contentScriptReady || !activeTabId) {
            console.warn("Content script not ready or no active tab. Live search deferred.");
            return;
        }

        const caseSensitive = document.getElementById("caseSensitiveCheckbox")?.checked || false;
        const wholeWords = document.getElementById("wholeWordsCheckbox")?.checked || false;
        const useRegex = document.getElementById("regexCheckbox")?.checked || false;
        const proximitySearch = document.getElementById("proximitySearchCheckbox")?.checked || false;

        // If proximity search is enabled, do not perform live search for main term
        if (proximitySearch) {
            clearHighlights(); // Optionally clear main term highlights when proximity is active
            return; // Do not proceed with live search for the primary term
        }


        const options = {
            caseSensitive: caseSensitive,
            wholeWords: wholeWords,
            useRegex: useRegex,
            proximitySearch: false, // Important: Proximity search is handled separately
            isProximity: false
        };

        chrome.tabs.sendMessage(activeTabId, {
            type: "SEARCH_TEXT",
            payload: {
                searchTerm,
                searchTerm2: "", // No second term for standard search
                proximityValue: 0, // No proximity for standard search
                options: options
            }
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.error("Live search error:", chrome.runtime.lastError);
            } else if (response) {
                // No status update needed here for live search, it's real-time
                if (searchTerm) {
                    updateStatus(`Found ${response.count || 0} matches`); // Update match count if needed
                    setTimeout(() => {
                        chrome.tabs.sendMessage(activeTabId, { type: "RENDER_TICK_MARKS" });
                    }, 200);
                }
            }
        });
    }

    function clearHighlights() {
        if (!contentScriptReady || !activeTabId) {
            return;
        }
        chrome.tabs.sendMessage(activeTabId, { type: "CLEAR_HIGHLIGHTS" });
        updateStatus(""); // Clear status message when highlights are cleared
    }

    function updateStatus(message) {
        const statusElement = document.getElementById("status");
        if (statusElement) {
            statusElement.textContent = message;
        }
    }


    // Expose functions to the global scope if needed, or just keep them module-internal
    window.advancedFindLiveSearch = {
        initializeLiveSearch,
        setContentScriptReady,
        clearHighlights, // Export clearHighlights if needed externally
    };

})();
