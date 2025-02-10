// /popup.js
document.addEventListener("DOMContentLoaded", () => {
    console.log("Popup DOM ready");

    let activeTabId = null;
    let contentScriptReady = false;
    let retryCount = 0;
    const MAX_RETRIES = 5;
    const RETRY_DELAY = 200;
    let lastSearchTerm = ""; // New: stores the last search term used
    

    function initializePopup() {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs && tabs[0]) {
                if (tabs[0].url.startsWith('chrome://') || tabs[0].url.startsWith('edge://')) {
                    updateStatus("Error: Cannot run on browser pages");
                    return;
                }
                activeTabId = tabs[0].id;
                checkContentScript();
                renderSearchHistory(); // if you’re maintaining search history
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
            console.log(`Retrying connection (<span class="math-inline">\{retryCount\}/</span>{MAX_RETRIES})...`);
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
                "lib/mark.min.js", // Include mark.js here
                "modules/config.js",
                "modules/dom-utils.js",
                "modules/search-utils.js",
                "modules/highlight-manager.js",
                "content.js"
            ]
        }).then(() => {
            console.log("Content script injected successfully");
            // No need to send INITIALIZE_CONTENT_SCRIPT, it initializes itself
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

    // --- Regex Mode Functions ---
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

        const regexOptions = document.getElementsByName("regexOption");
        regexOptions.forEach(option => {
            option.addEventListener("change", (e) => {
                const input = document.getElementById("regexSearchInput");
                switch (e.target.value) {
                    case "numbers":
                        input.value = "\\b\\d{5,}\\b";
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

        const regexHelpButton = document.getElementById("regexHelpButton");
        if (regexHelpButton) {
            regexHelpButton.addEventListener("click", () => {
                const helpModal = document.getElementById("regexHelpModal");
                if (helpModal) {
                    helpModal.classList.toggle("hidden");
                }
            });
        }

        const regexHelpClose = document.getElementById("regexHelpClose");
        if (regexHelpClose) {
            regexHelpClose.addEventListener("click", () => {
                const helpModal = document.getElementById("regexHelpModal");
                if (helpModal) {
                    helpModal.classList.add("hidden");
                }
            });
        }

        document.getElementById("returnStandardMode").addEventListener("click", () => {
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
                    searchTerm2: "",  // No second term in regex mode
                    proximityValue: 0, // No proximity in regex mode
                    options: {
                        caseSensitive: document.getElementById("caseSensitiveCheckbox")?.checked || false,
                        wholeWords: document.getElementById("wholeWordsCheckbox")?.checked || false,
                        useRegex: true, // IMPORTANT: Set useRegex to true
                        proximitySearch: false,
                        isProximity: false
                    }
                }
            }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error("Regex search error:", chrome.runtime.lastError);
                    updateStatus("Search failed");
                } else if (response) {
                    console.log("Regex search response:", response);
                    updateStatus(`Found ${response.count} matches`);
                       setTimeout(() => {
                        chrome.tabs.sendMessage(activeTabId, { type: "RENDER_TICK_MARKS" });
                    }, 200);
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

    function handleClear() {
        if (!contentScriptReady || !activeTabId) return;
        chrome.tabs.sendMessage(activeTabId, { type: "CLEAR_HIGHLIGHTS" });
        updateStatus("");
    }




    function setupEventListeners() {
        const searchButton = document.getElementById("searchButton");
        const searchInput = document.getElementById("searchTermInput");
        const clearButton = document.getElementById("clearButton");
        const nextButton = document.getElementById("nextButton");
        const prevButton = document.getElementById("prevButton");
        const searchProximityButton = document.getElementById("searchProximityButton");
    
        if (searchButton && searchInput) {
            searchButton.addEventListener("click", () => {
                const term = searchInput.value.trim();
                if (!term) return;
                lastSearchTerm = term; // Update last search term
                handleSearch(term);
                updateSearchHistory(term);
            });
            searchInput.addEventListener("keyup", (event) => {
                if (event.key === "Enter") {
                    const term = searchInput.value.trim();
                    if (!term) return;
                    if (term === lastSearchTerm) {
                        // Same search term—trigger navigation to next match.
                        chrome.tabs.sendMessage(activeTabId, {
                            type: "NAVIGATE",
                            payload: { direction: "next" }
                        });
                    } else {
                        // New search term—update and perform a new search.
                        lastSearchTerm = term;
                        handleSearch(term);
                        updateSearchHistory(term);
                    }
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
        if (searchProximityButton) {
            searchProximityButton.addEventListener("click", handleProximitySearch);
        }
    }
    

    function handleProximitySearch() {
        if (!contentScriptReady || !activeTabId) {
            console.error("Content script not ready or no active tab");
            return;
        }

        const searchTerm1 = document.getElementById("proximityTerm1")?.value; // Use new IDs
        const searchTerm2 = document.getElementById("proximityTerm2")?.value; // Use new IDs
        const proximityValue = parseInt(document.getElementById("proximityValue")?.value || "10");

        if (!searchTerm1 || !searchTerm2) {
            updateStatus("Please enter both search terms for proximity search.");
            return;
        }

        const caseSensitive = document.getElementById("caseSensitiveCheckbox")?.checked || false;
        const wholeWords = document.getElementById("wholeWordsCheckbox")?.checked || false;
        const options = {
            caseSensitive: caseSensitive,
            wholeWords: wholeWords,
            useRegex: false,
            proximitySearch: true,
            isProximity: true
        };

        chrome.tabs.sendMessage(activeTabId, {
            type: "SEARCH_PROXIMITY",
            payload: {
                searchTerm: searchTerm1,  // Use new variable names
                searchTerm2: searchTerm2,
                proximityValue: proximityValue,
                options: options
            }
        }, (response) => {
           if (chrome.runtime.lastError) {
                console.error("Proximity search error:", chrome.runtime.lastError);
                updateStatus("Proximity search failed");
            } else if (response) {
                console.log("Proximity search response:", response);
                updateStatus(`Found ${response.count} proximity matches`);
                   setTimeout(() => {
                    chrome.tabs.sendMessage(activeTabId, { type: "RENDER_TICK_MARKS" });
                }, 200);
            }
        });
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
        // REMOVE proximity-related variables from here
        const caseSensitive = document.getElementById("caseSensitiveCheckbox")?.checked || false;
        const wholeWords = document.getElementById("wholeWordsCheckbox")?.checked || false;
        const useRegex = document.getElementById("regexCheckbox")?.checked || false;

        // Build the options object to send to the content script
        const options = {
            caseSensitive: caseSensitive,
            wholeWords: wholeWords,
            useRegex: useRegex,
            proximitySearch: false, // Ensure it's false here
            isProximity: false
        };

        console.log("Sending search request for:", searchTerm, "with options:", options);

        chrome.tabs.sendMessage(activeTabId, {
            type: "SEARCH_TEXT",
            payload: {
                searchTerm,
                searchTerm2: "", // No second term
                proximityValue: 0, //No proximity
                options // Send the options object
            }
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.error("Search error:", chrome.runtime.lastError);
                updateStatus("Search failed");
            } else if (response) {
                console.log("Search response:", response);
                updateStatus(`Found ${response.count} matches`);
                   setTimeout(() => {
                    chrome.tabs.sendMessage(activeTabId, { type: "RENDER_TICK_MARKS" });
                }, 200);
            }
        });
    }
    // --- Settings Panel Setup ---
    function setupSettingsPanel() {
        const settingsButton = document.getElementById('settings-button');
        const settingsPanel = document.getElementById('settings-panel');
        const closeSettings = document.getElementById('close-settings');
        const highlightColorPicker = document.getElementById('highlight-color');
        const restoreDefaultButton = document.getElementById('restore-default-color');
        const displayModeInputs = document.getElementsByName('display-mode');
        const ignoreDiacriticsCheckbox = document.getElementById('ignoreDiacriticsCheckbox');
        const animationSpeedInput = document.getElementById('animationSpeed');

        chrome.storage.sync.get(
          ['highlightColor', 'displayMode', 'ignoreDiacritics', 'animationSpeed'],
          (result) => {
            if (result.highlightColor) {
              highlightColorPicker.value = result.highlightColor;
            }
            const displayMode = result.displayMode || 'popup';
            const input = Array.from(displayModeInputs).find(input => input.value === displayMode);
            if (input) input.checked = true;
            if (displayMode === 'sidebar') {
              document.body.classList.add('sidebar-mode');
            } else {
              document.body.classList.remove('sidebar-mode');
            }
            if (result.ignoreDiacritics !== undefined) {
              ignoreDiacriticsCheckbox.checked = result.ignoreDiacritics;
            }
            if (result.animationSpeed) {
              animationSpeedInput.value = result.animationSpeed;
            }
          }
        );

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
          settingsPanel.classList.remove('hidden');
        });

        closeSettings.addEventListener('click', () => {
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
                document.body.classList.add('sidebar-mode');
                window.close(); // Close the popup when switching to sidebar
                if (activeTabId) {
                  chrome.tabs.sendMessage(activeTabId, { type: "TOGGLE_SIDEBAR" });
                }
              } else {
                document.body.classList.remove('sidebar-mode');
                if (activeTabId) {
                  chrome.tabs.sendMessage(activeTabId, { type: "CLEANUP_SIDEBAR" });
                }
              }
            });
          });
        });

        if (ignoreDiacriticsCheckbox) {
          ignoreDiacriticsCheckbox.addEventListener('change', (e) => {
            chrome.storage.sync.set({ ignoreDiacritics: e.target.checked });
          });
        }

        if (animationSpeedInput) {
          animationSpeedInput.addEventListener('change', (e) => {
            const speed = parseInt(e.target.value, 10);
            chrome.storage.sync.set({ animationSpeed: speed });
          });
        }
      }

    // --- Regex Mode Setup with Next/Previous Buttons (Already Corrected) ---
      function setupRegexMode() {
        const regexCheckbox = document.getElementById("regexCheckbox");
        if (!regexCheckbox) {
          console.error("Regex checkbox not found in the DOM!");
          return;
        }
        regexCheckbox.addEventListener("change", (e) => {
          if (e.target.checked) {
            switchToRegexMode();
          } else {
            returnToStandardMode();
          }
        });

        const regexOptions = document.getElementsByName("regexOption");
        regexOptions.forEach(option => {
          option.addEventListener("change", (e) => {
            const input = document.getElementById("regexSearchInput");
            switch (e.target.value) {
              case "numbers":
                // Only match numbers of 5 or more digits
                input.value = "\\b\\d{5,}\\b";
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
          });
        });

        // Regex help button & modal event listeners (as before)
        const regexHelpButton = document.getElementById("regexHelpButton");
        if (regexHelpButton) {
          regexHelpButton.addEventListener("click", () => {
            const helpModal = document.getElementById("regexHelpModal");
            if (helpModal) {
              helpModal.classList.toggle("hidden");
            }
          });
        }
        const regexHelpClose = document.getElementById("regexHelpClose");
        if (regexHelpClose) {
          regexHelpClose.addEventListener("click", () => {
            const helpModal = document.getElementById("regexHelpModal");
            if (helpModal) {
              helpModal.classList.add("hidden");
            }
          });
        }

        document.getElementById("returnStandardMode").addEventListener("click", () => {
          document.getElementById("regexCheckbox").checked = false;
          returnToStandardMode();
        });

        document.getElementById("regexSearchButton").addEventListener("click", () => {
          const searchTerm = document.getElementById("regexSearchInput").value;
          if (!contentScriptReady || !activeTabId) return;
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
                proximitySearch: false,
                isProximity: false
              }
            }
          }, (response) => {
            if (chrome.runtime.lastError) {
              console.error("Regex search error:", chrome.runtime.lastError);
            }
              else if (response) {
                    console.log("Search response:", response);
                    updateStatus(`Found ${response.count} matches`);
                    // --- NEW: After a short delay, render tick marks ---
                    setTimeout(() => {
                        chrome.tabs.sendMessage(activeTabId, { type: "RENDER_TICK_MARKS" });
                    }, 200);
                }
          });
        });

        document.getElementById("regexClearButton").addEventListener("click", () => {
          if (!contentScriptReady || !activeTabId) return;
          chrome.tabs.sendMessage(activeTabId, { type: "CLEAR_HIGHLIGHTS" });
        });

        // Regex navigation buttons
        document.getElementById("regexNextButton").addEventListener("click", () => {
          if (!contentScriptReady || !activeTabId) return;
          chrome.tabs.sendMessage(activeTabId, {
            type: "NAVIGATE",
            payload: { direction: "next" }
          });
        });
        document.getElementById("regexPrevButton").addEventListener("click", () => {
          if (!contentScriptReady || !activeTabId) return;
          chrome.tabs.sendMessage(activeTabId, {  type: "NAVIGATE",
            payload: { direction: "previous" }
          });
        });
      }


        // --- Optional: Search History functions ---
        function updateSearchHistory(searchTerm) {
            // (Implementation for updating history - if you add this feature)
        }
        function renderSearchHistory() {
            // (Implementation for rendering history - if you add this feature)
        }
        // --- End Search History functions ---

        initializePopup();
    });