// /popup.js
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
                renderSearchHistory(); // if you’re maintaining search history (not shown here for brevity)
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

    // --- NEW: Regex Mode Functionality ---
    function switchToRegexMode() {
        console.log("Switching to Regex Mode UI.");
        document.getElementById("standard-mode").classList.add("hidden");
        document.getElementById("regex-mode").classList.remove("hidden");
    }
    
    function returnToStandardMode() {
        console.log("Returning to Standard Mode UI.");
        document.getElementById("regex-mode").classList.add("hidden");
        document.getElementById("standard-mode").classList.remove("hidden");
    }
    
    function setupRegexMode() {
        const regexCheckbox = document.getElementById("regexCheckbox");
        if (!regexCheckbox) {
            console.error("Regex checkbox not found in the DOM!");
            return;
        }
        console.log("setupRegexMode: found regexCheckbox:", regexCheckbox);
    
        regexCheckbox.addEventListener("change", (e) => {
            console.log("Regex checkbox change event fired. Checked =", e.target.checked);
            if (e.target.checked) {
                switchToRegexMode();
            } else {
                returnToStandardMode();
            }
        });
    
        // When a radio option is selected, autofill the regex input.
        const regexOptions = document.getElementsByName("regexOption");
        regexOptions.forEach(option => {
            option.addEventListener("change", (e) => {
                const input = document.getElementById("regexSearchInput");
                switch (e.target.value) {
                    case "numbers":
                        input.value = "\\d+";
                        break;
                    case "emails":
                        input.value = "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}";
                        break;
                    case "urls":
                        input.value = "https?:\\/\\/[\\w\\.-]+(?:\\.[\\w\\.-]+)+[\\w\\-\\._~:/?#[\\]@!$&'()*+,;=.]+";
                        break;
                    case "words":
                        input.value = "\\b\\w+\\b";
                        break;
                    default:
                        input.value = "";
                }
                console.log("Regex option changed, new regex:", input.value);
            });
        });
    
        document.getElementById("returnStandardMode").addEventListener("click", () => {
            // Uncheck the regex checkbox so that standard UI is shown.
            document.getElementById("regexCheckbox").checked = false;
            returnToStandardMode();
        });
    
        document.getElementById("regexSearchButton").addEventListener("click", () => {
            const searchTerm = document.getElementById("regexSearchInput").value;
            if (!contentScriptReady || !activeTabId) return;
            console.log("Regex mode search initiated with term:", searchTerm);
            chrome.tabs.sendMessage(activeTabId, {
                type: "SEARCH_TEXT",
                payload: {
                    searchTerm,
                    searchTerm2: "",
                    proximityValue: 0,
                    options: {
                        caseSensitive: document.getElementById("caseSensitiveCheckbox")?.checked || false,
                        wholeWords: document.getElementById("wholeWordsCheckbox")?.checked || false,
                        useRegex: true,
                        proximitySearch: false
                    }
                }
            }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error("Regex search error:", chrome.runtime.lastError);
                    updateStatus("Search failed");
                } else if (response) {
                    console.log("Regex search response:", response);
                    updateStatus(`Found ${response.count} matches`);
                }
            });
        });
    
        document.getElementById("regexClearButton").addEventListener("click", () => {
            if (!contentScriptReady || !activeTabId) return;
            chrome.tabs.sendMessage(activeTabId, { type: "CLEAR_HIGHLIGHTS" });
            updateStatus("");
        });
    }
    
    // --- End Regex Mode ---

    function initializeUI() {
        updateStatus("Extension is ready!");
        setupEventListeners();
        setupProximitySearchUI(); 
        setupSettingsPanel();
        setupRegexMode();
    }

    function setupEventListeners() {
        const searchButton = document.getElementById("searchButton");
        const searchInput = document.getElementById("searchTermInput");
        const clearButton = document.getElementById("clearButton");
        const nextButton = document.getElementById("nextButton");
        const prevButton = document.getElementById("prevButton");

        if (searchButton && searchInput) {
            searchButton.addEventListener("click", () => {
                const term = searchInput.value;
                handleSearch(term);
                updateSearchHistory(term);
            });
            searchInput.addEventListener("keyup", (event) => {
                if (event.key === "Enter") {
                    const term = searchInput.value;
                    handleSearch(term);
                    updateSearchHistory(term);
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
        const proximitySearchContainer = document.getElementById("proximity-controls");
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
        const searchTerm2 = document.getElementById("searchTerm2")?.value || "";
        const proximityValue = parseInt(document.getElementById("proximityValue")?.value || "10");
        console.log("Sending search request for:", searchTerm);
        chrome.tabs.sendMessage(activeTabId, {
            type: "SEARCH_TEXT",
            payload: {
                searchTerm,
                searchTerm2,
                proximityValue,
                options: { caseSensitive, wholeWords, useRegex, proximitySearch }
            }
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.error("Search error:", chrome.runtime.lastError);
                updateStatus("Search failed");
            } else if (response) {
                console.log("Search response:", response);
                updateStatus(`Found ${response.count} matches`);
                // --- NEW: After a short delay, render tick marks ---
                setTimeout(() => {
                    chrome.tabs.sendMessage(activeTabId, { type: "RENDER_TICK_MARKS" });
                }, 200);
            }
        });
    }

    function setupSettingsPanel() {
        const settingsButton = document.getElementById('settings-button');
        const settingsPanel = document.getElementById('settings-panel');
        const closeSettings = document.getElementById('close-settings');
        const highlightColorPicker = document.getElementById('highlight-color');
        const restoreDefaultButton = document.getElementById('restore-default-color');
        const displayModeInputs = document.getElementsByName('display-mode');
    
        console.log("setupSettingsPanel: found settingsButton:", settingsButton, "and settingsPanel:", settingsPanel);
    
        chrome.storage.sync.get(['highlightColor', 'displayMode'], (result) => {
            if (result.highlightColor) {
                highlightColorPicker.value = result.highlightColor;
            }
            if (result.displayMode) {
                const input = Array.from(displayModeInputs).find(input => input.value === result.displayMode);
                if (input) input.checked = true;
                if (result.displayMode === 'sidebar') {
                    document.body.classList.add('sidebar-mode');
                }
            }
        });
    
        restoreDefaultButton.addEventListener('click', () => {
            const defaultColor = window.advancedFindConfig.config.settings.defaultHighlightColor;
            highlightColorPicker.value = defaultColor;
            chrome.storage.sync.set({ highlightColor: defaultColor }, () => {
                if (activeTabId) {
                    chrome.tabs.sendMessage(activeTabId, {
                        type: "UPDATE_HIGHLIGHT_COLOR",
                        payload: { color: defaultColor }
                    });
                }
            });
        });
    
        settingsButton.addEventListener('click', () => {
            console.log("Settings button clicked; showing settings panel.");
            settingsPanel.classList.remove('hidden');
        });
    
        closeSettings.addEventListener('click', () => {
            console.log("Close settings button clicked; hiding settings panel.");
            settingsPanel.classList.add('hidden');
        });
    
        highlightColorPicker.addEventListener('change', (e) => {
            const newColor = e.target.value;
            chrome.storage.sync.set({ highlightColor: newColor }, () => {
                if (activeTabId) {
                    chrome.tabs.sendMessage(activeTabId, {
                        type: "UPDATE_HIGHLIGHT_COLOR",
                        payload: { color: newColor }
                    });
                }
            });
        });
    
        displayModeInputs.forEach(input => {
            input.addEventListener('change', (e) => {
                const newMode = e.target.value;
                chrome.storage.sync.set({ displayMode: newMode }, () => {
                    if (newMode === 'sidebar') {
                        window.close();
                        if (activeTabId) {
                            chrome.tabs.sendMessage(activeTabId, { type: "TOGGLE_SIDEBAR" });
                        }
                    } else {
                        if (activeTabId) {
                            chrome.tabs.sendMessage(activeTabId, { type: "CLEANUP_SIDEBAR" });
                        }
                    }
                });
            });
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

    // --- Optional: Search History functions (if desired) ---
    function updateSearchHistory(searchTerm) {
        // (Implementation here if you wish to keep search history.)
    }
    function renderSearchHistory() {
        // (Implementation here if you wish to display search history.)
    }
    // --- End Search History functions ---

    initializePopup();
});
