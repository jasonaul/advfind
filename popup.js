document.addEventListener("DOMContentLoaded", () => {
    let activeTabId = null;
    let contentScriptReady = false;
    let retryCount = 0;
    const MAX_RETRIES = 5;
    const RETRY_DELAY = 200;

    function initializePopup() {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs && tabs[0]) {
                if (tabs[0].url.startsWith('chrome://') || tabs[0].url.startsWith('edge://')) {
                    updateStatus("Error: Cannot run on browser pages");
                    return;
                }
                activeTabId = tabs[0].id;
                checkContentScript();
            } else {
                console.error("No active tab found.");
                updateStatus("Error: No active tab found");
            }
        });
    }

    function checkContentScript() {
        if (!activeTabId) {
            console.error("No active tab ID available");
            return;
        }

        chrome.tabs.sendMessage(activeTabId, { type: "CHECK_INJECTION" }, (response) => {
            if (chrome.runtime.lastError) {
                handleConnectionError();
            } else if (response && response.injected) {
                console.log("Content script is ready");
                contentScriptReady = true;
                initializeUI();
            } else {
                console.log("Content script not ready, injecting...");
                injectContentScript();
            }
        });
    }

    function handleConnectionError() {
        if (retryCount < MAX_RETRIES) {
            retryCount++;
            console.log(`Retrying connection (${retryCount}/${MAX_RETRIES})...`);
            setTimeout(() => {
                injectContentScript();
            }, RETRY_DELAY * retryCount);
        } else {
            console.error("Failed to establish connection with content script");
            updateStatus("Error: Failed to connect to page");
            retryCount = 0;
        }
    }

    function injectContentScript() {
        chrome.scripting.executeScript({
            target: { tabId: activeTabId },
            files: [
                "modules/config.js",
                "modules/dom-utils.js",
                "modules/search-utils.js",
                "modules/highlight-manager.js",
                "content.js"
            ]
        }).then(() => {
            console.log("Content script injected successfully");
            chrome.tabs.sendMessage(activeTabId, { type: "INITIALIZE_CONTENT_SCRIPT" });
            setTimeout(checkContentScript, 100);
        }).catch(error => {
            console.error("Failed to inject content script:", error);
            updateStatus("Error: Failed to initialize extension");
            handleConnectionError();
        });
    }

    function updateStatus(message) {
        const statusElement = document.getElementById("status");
        if (statusElement) {
            statusElement.textContent = message;
        }
    }

    function initializeUI() {
        updateStatus("Extension is ready!");
        setupEventListeners();
        setupProximitySearchUI(); 
    }

    function setupEventListeners() {
        const searchButton = document.getElementById("searchButton");
        const searchInput = document.getElementById("searchTermInput");
        const clearButton = document.getElementById("clearButton");
        const nextButton = document.getElementById("nextButton");
        const prevButton = document.getElementById("prevButton");
        
        if (searchButton && searchInput) {
            searchButton.addEventListener("click", () => handleSearch(searchInput.value));
            searchInput.addEventListener("keyup", (event) => {
                if (event.key === "Enter") {
                    handleSearch(searchInput.value);
                }
            });
        }

        if (clearButton) {
            clearButton.addEventListener("click", handleClear);
        }

        if (nextButton) {
            nextButton.addEventListener("click", () => handleNavigation("next"));
        }

        if (prevButton) {
            prevButton.addEventListener("click", () => handleNavigation("previous"));
        }
    }

    function setupProximitySearchUI() {
        const proximitySearchCheckbox = document.getElementById("proximitySearchCheckbox");
        const proximitySearchContainer = document.getElementById("proximity-search-container");
        
        if (proximitySearchCheckbox && proximitySearchContainer) {
            proximitySearchCheckbox.addEventListener("change", (event) => {
                proximitySearchContainer.style.display = event.target.checked ? "block" : "none";
            });
        }
    }

    function handleSearch(searchTerm) {
        if (!contentScriptReady || !activeTabId) {
            console.error("Content script not ready or no active tab");
            return;
        }
    
        const caseSensitive = document.getElementById("caseSensitiveCheckbox")?.checked || false;
        const wholeWords = document.getElementById("wholeWordsCheckbox")?.checked || false;
        const useRegex = document.getElementById("regexCheckbox")?.checked || false;
        const proximitySearch = document.getElementById("proximitySearchCheckbox")?.checked || false;
        
        // Add these lines for proximity search
        const searchTerm2 = document.getElementById("searchTerm2")?.value || "";
        const proximityValue = parseInt(document.getElementById("proximityValue")?.value || "5");
    
        console.log("Sending search request for:", searchTerm);
        chrome.tabs.sendMessage(activeTabId, {
            type: "SEARCH_TEXT",
            payload: {
                searchTerm: searchTerm,
                searchTerm2: searchTerm2,
                proximityValue: proximityValue,
                options: {
                    caseSensitive,
                    wholeWords,
                    useRegex,
                    proximitySearch
                }
            }
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.error("Search error:", chrome.runtime.lastError);
                updateStatus("Search failed");
            } else if (response) {
                console.log("Search response:", response);
                updateStatus(`Found ${response.count} matches`);
            }
        });
    }

    function handleClear() {
        if (!contentScriptReady || !activeTabId) return;
        chrome.tabs.sendMessage(activeTabId, { type: "CLEAR_HIGHLIGHTS" });
        updateStatus("");
    }

    function handleNavigation(direction) {
        if (!contentScriptReady || !activeTabId) return;
        chrome.tabs.sendMessage(activeTabId, {
            type: "NAVIGATE",
            payload: { direction }
        });
    }

    // Start initialization
    initializePopup();
});