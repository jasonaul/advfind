
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
        // Don't setup listeners immediately, wait for UI elements
         // setupLiveSearchEventListeners(); // Called from popup.js::initializeUI now
    }

    function setContentScriptReady(ready) {
        contentScriptReady = ready;
        // If it just became ready, and there's a term, maybe trigger a search?
        const searchInput = document.getElementById("searchTermInput");
        if (ready && searchInput && searchInput.value.trim()) {
            performLiveSearch(searchInput.value.trim());
        }
    }

   // Setup listeners (called from popup.js when UI is ready)
   function setupLiveSearchEventListeners() {
        const searchInput = document.getElementById("searchTermInput");
        if (!searchInput) {
            console.error("Live Search: Search input field not found!");
            return;
        }

        searchInput.addEventListener('input', (event) => {
            const searchTerm = event.target.value; // Don't trim immediately, allow spaces
            const trimmedTerm = searchTerm.trim();

             // If term contains comma, disable live search for multi-term
             if (searchTerm.includes(',')) {
                 clearTimeout(debounceTimer);
                 // Clear highlights if live search was active
                 if (lastSearchTerm && !lastSearchTerm.includes(',')) {
                     clearHighlights();
                 }
                 lastSearchTerm = searchTerm; // Update last term even if not searching
                 updateStatus("Enter multiple terms separated by commas."); // Inform user
                 return; // Stop live search for multi-term input
             }


            // Standard live search logic
            if (trimmedTerm === lastSearchTerm.trim()) return; // Prevent re-search if effective term hasn't changed
             lastSearchTerm = searchTerm; // Store potentially untrimmed version

            clearTimeout(debounceTimer);

            debounceTimer = setTimeout(() => {
                if (trimmedTerm) {
                    performLiveSearch(trimmedTerm);
                } else {
                    clearHighlights(); // Clear highlights if input is empty
                    lastSearchTerm = ""; // Reset last term if cleared
                }
            }, 300); // Increased debounce delay slightly
        });
    }


    function performLiveSearch(searchTerm) {
        if (!contentScriptReady || !activeTabId) {
            console.warn("Live search: Content script not ready or no active tab.");
            return;
        }

         // Prevent live search if certain modes are active
         if (document.getElementById("regexCheckbox")?.checked || document.getElementById("proximitySearchCheckbox")?.checked) {
             clearHighlights(); // Clear standard highlights if switching to other modes
             return;
         }
          // Check again for comma, just in case
         if (searchTerm.includes(',')) {
             return;
         }


        const caseSensitive = document.getElementById("caseSensitiveCheckbox")?.checked || false;
        const wholeWords = document.getElementById("wholeWordsCheckbox")?.checked || false;
         const ignoreDiacritics = document.getElementById('ignoreDiacriticsCheckbox')?.checked || false;
         const excludeTerm = document.getElementById("excludeTermInput")?.value.trim() || ""; // Include exclude term

         // --- Handle Wildcard for Live Search ---
         let useRegexForLive = false;
         let processedTerm = searchTerm;
         if (searchTerm.includes('*')) {
              useRegexForLive = true;
              processedTerm = searchTerm.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join('.*?');
         }


        const options = {
            caseSensitive: caseSensitive,
            wholeWords: wholeWords,
            useRegex: useRegexForLive, // Use regex only if wildcard detected
            ignoreDiacritics: ignoreDiacritics,
            proximitySearch: false,
            isProximity: false,
            excludeTerm: excludeTerm // Pass exclude term
        };

         // Send as array for consistency with highlight manager
         const termsToSend = [processedTerm];


        chrome.tabs.sendMessage(activeTabId, {
            type: "SEARCH_TEXT",
            payload: {
                searchTerms: termsToSend, // Send as array
                options: options
            }
        }, (response) => {
            if (chrome.runtime.lastError) {
                // Ignore common "Receiving end does not exist" if popup closes quickly
                 if (!chrome.runtime.lastError.message.includes("Receiving end does not exist")) {
                    console.error("Live search error:", chrome.runtime.lastError.message);
                }
            } else if (response) {
                // Update status with count (subtly for live search)
                updateStatus(`Matches: ${response.count || 0}`);
                 if (searchTerm && response.count > 0) { // Only render ticks if matches found
                     // Debounce tick mark rendering? Or just call it?
                     setTimeout(() => {
                          chrome.tabs.sendMessage(activeTabId, { type: "RENDER_TICK_MARKS" }, (r) => {
                              if (chrome.runtime.lastError && !chrome.runtime.lastError.message.includes("Receiving end does not exist")) {
                                   console.warn("Error rendering live ticks:", chrome.runtime.lastError.message);
                               }
                          });
                     }, 100); // Short delay for ticks
                } else {
                     // Clear ticks immediately if no matches
                     chrome.tabs.sendMessage(activeTabId, { type: "CLEAR_TICK_MARKS" }, (r) => {
                         if (chrome.runtime.lastError && !chrome.runtime.lastError.message.includes("Receiving end does not exist")) {
                             console.warn("Error clearing live ticks:", chrome.runtime.lastError.message);
                         }
                     });
                 }
            }
        });
    }


    function clearHighlights() {
        if (!contentScriptReady || !activeTabId) return;
        // Only clear if live search should be active (not regex/proximity)
         if (document.getElementById("regexCheckbox")?.checked || document.getElementById("proximitySearchCheckbox")?.checked) {
             return;
         }

        chrome.tabs.sendMessage(activeTabId, { type: "CLEAR_HIGHLIGHTS" }, (response) => {
             if (chrome.runtime.lastError && !chrome.runtime.lastError.message.includes("Receiving end does not exist")) {
                 console.warn("Error sending CLEAR_HIGHLIGHTS from live search:", chrome.runtime.lastError.message);
             } else {
                 updateStatus(""); // Clear status
                  chrome.tabs.sendMessage(activeTabId, { type: "CLEAR_TICK_MARKS" }, (r) => { // Clear ticks too
                      if (chrome.runtime.lastError && !chrome.runtime.lastError.message.includes("Receiving end does not exist")) {
                           console.warn("Error clearing live ticks on clear:", chrome.runtime.lastError.message);
                       }
                  });
             }
        });
    }

    function updateStatus(message) {
        const statusElement = document.getElementById("status");
        if (statusElement) {
            statusElement.textContent = message;
        }
    }

    // Expose necessary functions
    window.advancedFindLiveSearch = {
        initializeLiveSearch,
        setContentScriptReady,
        setupLiveSearchEventListeners, // Expose setup
        clearHighlights,
        performLiveSearch
    };

    console.log("Advanced Find: Live Search module loaded.");

})();