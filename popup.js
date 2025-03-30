document.addEventListener("DOMContentLoaded", () => {
    
    let activeTabId = null;
    let contentScriptReady = false;
    let retryCount = 0;
    const MAX_RETRIES = 5;
    const RETRY_DELAY = 200;
    let lastExplicitSearchTerm = "";
    const MAX_HISTORY_ITEMS = 10;

  const listeners = []; // Store listeners to remove them later
  
    // --- Initialization ---
    function initializePopup() {
        
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            
            if (tabs && tabs[0]) {
                const tab = tabs[0];
                const url = tab.url;
                
                const restrictedPrefixes = ['chrome://', 'edge://', 'chrome-extension://', 'about:', 'view-source:', 'file://'];
                const allowedPrefixes = ['http://', 'https://'];
                if (!url || restrictedPrefixes.some(prefix => url.startsWith(prefix)) || !allowedPrefixes.some(prefix => url.startsWith(prefix))) {
                    const simpleUrl = url ? url.split('/')[0] : 'N/A';
                    console.warn(`[Popup] Cannot run on this page type: ${simpleUrl}`);
                    updateStatus(`Error: Cannot run on ${simpleUrl} pages`, true);
                    disableUI();
                    return;
                }
                if (url.startsWith('file://')) { updateStatus("Warning: May not work correctly on local file URLs.", false); }

                activeTabId = tab.id;
                
                loadAndApplySettings(() => {
                    
                    checkContentScript(); // Check connection AFTER settings are ready
                    renderSearchHistory();
                });
            } else {
                console.error("[Popup] No active tab found in query.");
                updateStatus("Error: No active tab found", true);
                disableUI();
            }
        });
    }
  
    // --- Settings Loading ---
    function loadAndApplySettings(callback) {
        const settingKeys = [
            'highlightColor',
            // 'displayMode', // Only if sidebar is actively used
            'ignoreDiacritics',
            // 'animationSpeed', // Removed
            'searchHistoryEnabled',
            'persistentHighlightsEnabled',
            'multiHighlightColors',
            // 'sidebarWidth' // Only if sidebar is actively used
        ];
        chrome.storage.sync.get(settingKeys, (settings) => {
            if (chrome.runtime.lastError) {
                console.error("Error loading settings:", chrome.runtime.lastError.message);
            } else {
                
                if (window.advancedFindConfig && window.advancedFindConfig.updateConfigFromStorage) {
                    window.advancedFindConfig.updateConfigFromStorage(settings);
                } else {
                     console.warn("advancedFindConfig or updateConfigFromStorage not available yet.");
                }
                applyPopupSettings(settings); // Apply to popup UI elements
                applyGlobalOptionCheckboxes(settings); // Apply to the global checkboxes
            }
            if (callback) callback();
        });
    }
  
     // Apply settings that affect the popup's appearance/behavior directly
     function applyPopupSettings(settings) {
        if (!settings) return;
  
         // Apply to Settings Panel Inputs
         const highlightColorPicker = document.getElementById('highlight-color');
         if (highlightColorPicker && settings.highlightColor) highlightColorPicker.value = settings.highlightColor;
  
         const ignoreDiacriticsSettingsChk = document.getElementById('ignoreDiacriticsSettingsCheckbox');
         if (ignoreDiacriticsSettingsChk && settings.ignoreDiacritics !== undefined) ignoreDiacriticsSettingsChk.checked = settings.ignoreDiacritics;
  
         const searchHistoryEnabledChk = document.getElementById('searchHistoryEnabled');
         if (searchHistoryEnabledChk && settings.searchHistoryEnabled !== undefined) searchHistoryEnabledChk.checked = settings.searchHistoryEnabled;
  
         const persistentHighlightsEnabledChk = document.getElementById('persistentHighlightsEnabled');
         if (persistentHighlightsEnabledChk && settings.persistentHighlightsEnabled !== undefined) persistentHighlightsEnabledChk.checked = settings.persistentHighlightsEnabled;
  
         if (settings.multiHighlightColors && Array.isArray(settings.multiHighlightColors)) {
             settings.multiHighlightColors.forEach((color, index) => {
                 const picker = document.getElementById(`multiColor${index + 1}`);
                 if (picker) picker.value = color;
             });
         }
  
         // Apply Display Mode if using sidebar
         // const displayModePopup = document.querySelector('input[name="display-mode"][value="popup"]');
         // const displayModeSidebar = document.querySelector('input[name="display-mode"][value="sidebar"]');
         // if (displayModePopup && displayModeSidebar) {
         //     if (settings.displayMode === 'sidebar') displayModeSidebar.checked = true;
         //     else displayModePopup.checked = true;
         // }
     }
  
     // Apply loaded settings to the GLOBAL checkboxes (Case Sensitive, Whole Words, etc.)
     function applyGlobalOptionCheckboxes(settings) {
          // Note: Case Sensitive & Whole Words are NOT saved settings currently.
          // Only apply settings that *are* saved, like Ignore Diacritics.
          const ignoreDiacriticsGlobalChk = document.getElementById('ignoreDiacriticsCheckbox');
          if (ignoreDiacriticsGlobalChk && settings.ignoreDiacritics !== undefined) {
              ignoreDiacriticsGlobalChk.checked = settings.ignoreDiacritics;
          }
          // Add others here if you make Case Sensitive/Whole Words persistent settings
     }
  
  
    // --- UI State Management ---
    function disableUI() {
        const inputs = document.querySelectorAll('#container input, #container button, #container label');
        inputs.forEach(el => {
            if (el.tagName === 'LABEL') el.classList.add('disabled');
            else el.disabled = true;
        });
        const status = document.getElementById('status');
        if (status) status.classList.add('error');
        console.warn("UI Disabled.");
    }
  
    function enableUI() {
        const inputs = document.querySelectorAll('#container input, #container button, #container label');
        inputs.forEach(el => {
             if (el.tagName === 'LABEL') el.classList.remove('disabled');
             else el.disabled = false;
         });
        const status = document.getElementById('status');
        if (status) status.classList.remove('error');
         
    }
  
    function updateStatus(message, isError = false) {
        const statusElement = document.getElementById("status");
        const regexStatusElement = document.getElementById("regex-status");
        // Determine which status element is currently visible
        const standardModeVisible = !document.getElementById("standard-mode")?.classList.contains("hidden");
        const targetStatusElement = standardModeVisible ? statusElement : regexStatusElement;
  
        if (targetStatusElement) {
            targetStatusElement.textContent = message;
            targetStatusElement.classList.toggle('error', isError);
            targetStatusElement.classList.toggle('success', !isError && message.toLowerCase().includes('found')); // Add success class for counts
        } else if (statusElement) { // Fallback
            statusElement.textContent = message;
            statusElement.classList.toggle('error', isError);
            statusElement.classList.toggle('success', !isError && message.toLowerCase().includes('found'));
        }
    }
  
  
    // --- Content Script Injection & Communication ---
    function checkContentScript() {
        if (!activeTabId) { console.error("[Popup] No active tab ID available for checkContentScript"); updateStatus("Error: Tab communication failed", true); disableUI(); return; }

        
      chrome.tabs.sendMessage(activeTabId, { type: "CHECK_INJECTION" }, (response) => {
          if (chrome.runtime.lastError) {
              console.warn("Connection error checking content script:", chrome.runtime.lastError.message);
              handleConnectionError(); // Handles retries or final failure
          } else if (response && response.injected) {
              
              contentScriptReady = true;
              retryCount = 0; // Reset retries on success
              if (window.advancedFindLiveSearch) {
                  window.advancedFindLiveSearch.setContentScriptReady(true);
              }
              initializeUI(); // Initialize UI only when script is confirmed ready
          } else {
              
              // Optional: Show "Initializing..." status briefly
              updateStatus("Initializing extension on page...");
              injectContentScript();
          }
      });
  }
  
  function handleConnectionError() {
    console.warn(`[Popup] handleConnectionError called. Retry count: ${retryCount}`);

      // Don't retry indefinitely if the page is restricted (already checked in initializePopup)
      const url = chrome.tabs.get(activeTabId, tab => tab?.url); // Check URL again if possible
       const restrictedPrefixes = ['chrome://', 'edge://', 'chrome-extension://', 'about:', 'view-source:'];
      if (url && restrictedPrefixes.some(prefix => url.startsWith(prefix))) {
          console.error("Connection error likely due to restricted page. Stopping.");
          updateStatus("Error: Cannot connect to this page type", true);
          disableUI();
          retryCount = 0; // Reset retries
          return;
      }
  
  
      if (retryCount < MAX_RETRIES) {
        retryCount++;
        updateStatus(`Connecting (${retryCount}/${MAX_RETRIES})...`);
        setTimeout(checkContentScript, RETRY_DELAY * retryCount); // Just re-check, don't inject again
    } else {
        console.error("[Popup] MAX RETRIES REACHED. Failed to establish connection with content script.");
        updateStatus("Error: Failed to connect to page content", true);
        disableUI();
        retryCount = 0; // Reset for future attempts maybe?
    }
  }
  
  
    function injectContentScript() {
        
        // Ensure config is loaded globally before injection attempts rely on it.
        // Although background.js injects config.js first, being explicit can help debugging.
        if (!window.advancedFindConfig) {
            console.error("Config module not loaded before injection attempt!");
            updateStatus("Error: Extension files missing", true);
            disableUI();
            return;
        }
  
        chrome.scripting.executeScript({
            target: { tabId: activeTabId },
            files: [
                "lib/mark.min.js",
                "modules/config.js",          // Ensure config is first
                "modules/dom-utils.js",
                "modules/search-utils.js",
                "modules/highlight-manager.js",
                "modules/persistent-highlights.js",
                // "modules/export-highlights.js", // Not needed in content script
                "content.js"                  // content.js must be last
            ]
        }).then(() => {
            
            setTimeout(checkContentScript, 250); // Check after a delay
        }).catch(error => {
            console.error("Failed to inject content script:", error);
            if (error.message.includes("Cannot access") || error.message.includes("extension context invalidated")) {
                updateStatus("Error: Cannot access this page", true);
            } else if (error.message.includes("Missing host permission")) {
                 updateStatus("Error: Extension needs permission for this URL", true);
                 // Consider adding a button/link to request permissions if possible/desired
            } else if (error.message.includes("Failed to load")) {
                 updateStatus("Error: Could not load extension files", true);
            }
            else {
                updateStatus("Error: Failed to initialize on page", true);
            }
            disableUI();
            retryCount = 0; // Reset retries after injection failure
        });
    }
  
  
    // --- UI Initialization ---
    function initializeUI() {
        if (!contentScriptReady) {
           console.warn("Attempted to initialize UI, but content script is not ready.");
           return;
       }
       
       updateStatus("Ready");
       enableUI();

       removeEventListeners(); // Clean up first
       setupEventListeners();  // Add fresh listeners

       // Setup specific UI sections
       setupProximitySearchUI();
       setupSettingsPanel();
       setupRegexMode();

       // Initialize Live Search (if module exists)
       if (window.advancedFindLiveSearch) { window.advancedFindLiveSearch.initializeLiveSearch(activeTabId, contentScriptReady); window.advancedFindLiveSearch.setupLiveSearchEventListeners(); } else { console.error("[Popup] Live Search module not found!"); }

       // Set initial mode
       returnToStandardMode();
       setupProximitySearchUI(); // Ensure proximity visibility is correct after mode switch

       // **** RUN SYNC LAST ****
       syncInitialToggleStates(); // Ensure visuals match state AFTER everything else is set up

       // Keep this log last if preferred
   }
  
  
  
   function addListener(element, event, handler) { if (element) { element.addEventListener(event, handler); listeners.push({ element, event, handler }); } else { console.warn(`[Popup] Cannot add listener: Element not found for event ${event}`); } }
  
   function removeEventListeners() { listeners.forEach(({ element, event, handler }) => { if (element) { element.removeEventListener(event, handler); } }); listeners.length = 0; }

      // --- Checkbox & Radio State Class Handling ---
      const toggleInputs = document.querySelectorAll('.checkbox-label input[type="checkbox"], .radio-label input[type="radio"]');

      function handleToggleChange(event) {
        const input = event.target;
        const label = input.closest('.checkbox-label, .radio-label');
        // Keep this group of logs
        
        
        
        if (!label) { console.warn("[Popup] Could not find parent label for toggle input:", input); return; }
        if (input.type === 'checkbox') {
            const shouldBeChecked = input.checked;
            
            label.classList.toggle('is-checked', shouldBeChecked);
            
        } else if (input.type === 'radio') { /* Keep radio logic and logs */
            const groupName = input.name; if (groupName) { document.querySelectorAll(`input[type="radio"][name="${groupName}"]`).forEach(radio => { const otherLabel = radio.closest('.radio-label'); if (otherLabel && radio !== input) { otherLabel.classList.remove('is-checked'); } }); }
            if (input.checked) { label.classList.add('is-checked'); }
        }
    }

      // Add listeners using our tracked method
      toggleInputs.forEach(input => {
          addListener(input, 'change', handleToggleChange);
          // No need to set initial state here, syncInitialToggleStates will handle it after UI is built
      });
  
      function setupEventListeners() {
        // Log start
    
        // --- Get Element References ---
        // (It's good practice to get references here, even if addListener checks later)
        const searchButton = document.getElementById("searchButton");
        const searchInput = document.getElementById("searchTermInput");
        const clearButton = document.getElementById("clearButton");
        const nextButton = document.getElementById("nextButton");
        const prevButton = document.getElementById("prevButton");
        const searchProximityButton = document.getElementById("searchProximityButton");
        const exportButton = document.getElementById("exportButton");
        const regexSearchButton = document.getElementById("regexSearchButton");
        const regexInput = document.getElementById("regexSearchInput");
        const regexClearButton = document.getElementById("regexClearButton");
        const regexExportButton = document.getElementById("regexExportButton");
        const regexNextButton = document.getElementById("regexNextButton");
        const regexPrevButton = document.getElementById("regexPrevButton");
        const returnStandardModeButton = document.getElementById("returnStandardMode");
        const regexCheckbox = document.getElementById("regexCheckbox");
        const proximityCheckbox = document.getElementById("proximitySearchCheckbox");
        const settingsButton = document.getElementById('settings-button');
        const closeSettings = document.getElementById('close-settings');
        const regexHelpButton = document.getElementById("regexHelpButton");
        const regexHelpClose = document.getElementById("regexHelpClose");
        const restoreDefaultButton = document.getElementById('restore-default-color');
        const settingsPanel = document.getElementById('settings-panel');
        const helpModal = document.getElementById("regexHelpModal");
        const ignoreDiacriticsSettingsChk = document.getElementById('ignoreDiacriticsSettingsCheckbox'); // Get settings checkbox
        const searchHistoryEnabledChk = document.getElementById('searchHistoryEnabled'); // Get settings checkbox
        const persistentHighlightsEnabledChk = document.getElementById('persistentHighlightsEnabled'); // Get settings checkbox
    
    
        // --- Checkbox & Radio State Handling ---
        // Select inputs INSIDE the correct labels
        const toggleInputs = document.querySelectorAll('.checkbox-label input[type="checkbox"], .radio-label input[type="radio"]');
    
        // --- CRUCIAL DEBUGGING LOG ---
        
        if (toggleInputs.length === 0) {
             console.error("[Popup] !!! NO TOGGLE INPUTS FOUND by selector - Checkbox/Radio listeners will NOT be added. Verify HTML structure and CSS classes (.checkbox-label, .radio-label) match the querySelectorAll string. !!!");
        } else {
             // Log the NodeList
        }
        // --- END CRUCIAL DEBUGGING LOG ---
    
        // Add listeners using our tracked method, LOGGING each addition
        toggleInputs.forEach(input => {
            // --- DEBUGGING ---
            
            // --- END DEBUGGING ---
            addListener(input, 'change', handleToggleChange); // Use the tracked addListener
        });
    
    
        // --- Add Listeners for Other Controls (using addListener helper) ---
    
        // Standard Search Button & Input
        addListener(searchButton, "click", () => {
            if (!searchInput || proximityCheckbox?.checked) return;
            const currentTerm = searchInput.value.trim();
            if (!currentTerm) return;
            if (currentTerm === lastExplicitSearchTerm) { handleNavigation("next"); }
            else { lastExplicitSearchTerm = currentTerm; handleSearch(currentTerm); saveSearchHistory(currentTerm); }
        });
        addListener(searchInput, "keyup", (event) => { if (event.key === "Enter") searchButton?.click(); });
    
        // Clear Buttons
        addListener(clearButton, "click", handleClear);
        addListener(regexClearButton, "click", handleClear);
    
        // Navigation Buttons
        addListener(nextButton, "click", () => handleNavigation("next"));
        addListener(prevButton, "click", () => handleNavigation("previous"));
        addListener(regexNextButton, "click", () => handleNavigation("next"));
        addListener(regexPrevButton, "click", () => handleNavigation("previous"));
    
        // Proximity Controls
        addListener(searchProximityButton, "click", handleProximitySearch);
        addListener(proximityCheckbox, "change", (event) => {
          if (!proximityCheckbox) return; // Guard
          const proximitySearchContainer = document.getElementById("proximity-controls");
          if (!proximitySearchContainer) return;
          const isChecked = event.target.checked;
          
          proximitySearchContainer.classList.toggle("hidden", !isChecked);
           if (isChecked) {
                if(regexCheckbox) regexCheckbox.checked = false; // Turn off regex mode if turning on prox
                handleToggleChange({ target: regexCheckbox }); // Manually trigger visual update for regex toggle if needed
                returnToStandardMode(); // Ensure standard mode is visible
                handleClear(); // Clear previous results/inputs
                if(searchInput) searchInput.value = ''; // Ensure standard input visually cleared
                updateStatus("Proximity search active.");
                document.getElementById("proximityTerm1")?.focus();
           } else {
                updateStatus("");
           }
       });
    
        // Export Buttons
        addListener(exportButton, "click", handleExportHighlights);
        addListener(regexExportButton, "click", handleExportHighlights);
    
        // Regex Mode Specific
        addListener(regexSearchButton, "click", () => {
             if (!regexInput) return;
            const currentTerm = regexInput.value.trim();
             if (!currentTerm) return;
             const isRegexModeVisible = !document.getElementById("regex-mode")?.classList.contains("hidden");
             if (isRegexModeVisible && currentTerm === lastExplicitSearchTerm) { handleNavigation("next"); }
             else { lastExplicitSearchTerm = currentTerm; handleRegexSearch(currentTerm); saveSearchHistory(currentTerm); }
        });
        addListener(regexInput, "keyup", (event) => { if (event.key === "Enter") regexSearchButton?.click(); });
        addListener(returnStandardModeButton, "click", () => {
            if(regexCheckbox) regexCheckbox.checked = false; // Uncheck the toggle
            handleToggleChange({ target: regexCheckbox }); // Manually trigger visual update for toggle
             returnToStandardMode();
        });
        addListener(regexCheckbox, "change", (e) => { // Mode toggle checkbox
             // The handleToggleChange listener ALREADY handles the visual is-checked class
             if (e.target.checked) switchToRegexMode(); else returnToStandardMode();
        });
    
        // Regex Options Radios (listeners added in setupRegexMode via addListener)
    
        // Settings Panel
        addListener(settingsButton, 'click', () => settingsPanel?.classList.remove('hidden'));
        addListener(closeSettings, 'click', () => settingsPanel?.classList.add('hidden'));
        addListener(settingsPanel, 'click', (e) => { if (e.target === settingsPanel) settingsPanel.classList.add('hidden'); });
        addListener(restoreDefaultButton, 'click', () => {
           if (highlightColorPicker && window.advancedFindConfig) {
                const defaultColor = window.advancedFindConfig.config.settings.defaultHighlightColor || "#ffff00";
                highlightColorPicker.value = defaultColor;
                highlightColorPicker.dispatchEvent(new Event('change', { bubbles: true })); // Trigger change
           }
       });
        const settingsInputs = settingsPanel?.querySelectorAll('input, select'); // Select ALL inputs in settings
        settingsInputs?.forEach(input => {
            // Add the generic setting change handler
            addListener(input, 'change', handleSettingChange);
            // *If* the input is a checkbox/radio, *also* add the visual toggle handler
            if ((input.type === 'checkbox' || input.type === 'radio') && input.closest('.checkbox-label, .radio-label')) {
                 
                 addListener(input, 'change', handleToggleChange);
            }
        });
    
        // Regex Help Modal
        addListener(regexHelpButton, "click", () => helpModal?.classList.remove("hidden"));
        addListener(regexHelpClose, "click", () => helpModal?.classList.add("hidden"));
        addListener(helpModal, 'click', (e) => { if (e.target === helpModal) helpModal.classList.add('hidden'); });
    
        // Log end
    }
      // --- New function to sync initial states ---
      function syncInitialToggleStates() {
        const toggleInputs = document.querySelectorAll('.checkbox-label input[type="checkbox"], .radio-label input[type="radio"]');
        toggleInputs.forEach(input => {
            const label = input.closest('.checkbox-label, .radio-label');
            if (label) {
                 // Directly set class based on current checked state
                 label.classList.toggle('is-checked', input.checked);

                 // Ensure radio groups only have one .is-checked initially
                 if (input.type === 'radio' && input.name) {
                      if (!input.checked) { // Remove class if not checked
                          label.classList.remove('is-checked');
                      } else { // If checked, ensure others in group don't have it
                          document.querySelectorAll(`input[type="radio"][name="${input.name}"]`).forEach(otherRadio => {
                              if (otherRadio !== input) {
                                   otherRadio.closest('.radio-label')?.classList.remove('is-checked');
                              }
                          });
                          label.classList.add('is-checked'); // Ensure current one has it
                      }
                 }
            }
        });
         
    }
  
     // --- Settings Change Handler ---
    function handleSettingChange(e) {
         if (!e?.target) return;
         
  
         // 1. Gather all current settings from the panel
         const currentSettings = gatherCurrentSettings();
  
         // 2. Save settings to chrome.storage.sync
         chrome.storage.sync.set(currentSettings, () => {
             if(chrome.runtime.lastError) {
                 console.error("Error saving settings:", chrome.runtime.lastError.message);
                 updateStatus("Error saving settings", true);
             } else {
                 
                 // Update live config object immediately
                 if(window.advancedFindConfig?.updateConfigFromStorage) {
                     window.advancedFindConfig.updateConfigFromStorage(currentSettings);
                 }
                 // Apply relevant settings to global options checkboxes
                 applyGlobalOptionCheckboxes(currentSettings);
             }
         });
  
         // 3. Send updated settings to content script
         if (activeTabId && contentScriptReady) {
             chrome.tabs.sendMessage(activeTabId, {
                 type: "UPDATE_SETTINGS",
                 payload: currentSettings // Send the gathered settings
             }, response => {
                  if (chrome.runtime.lastError) {
                      // Ignore common error if popup closes during async message
                       if (!chrome.runtime.lastError.message.includes("Receiving end does not exist")) {
                           console.warn("Could not send settings update:", chrome.runtime.lastError.message);
                       }
                  } else if (response?.success) {
                      
                      // Optional: Trigger a re-highlight if necessary (e.g., color change)
                      // This could be expensive, do it selectively.
                      // if (e.target.type === 'color' || e.target.id === 'ignoreDiacriticsSettingsCheckbox') {
                      //    triggerReHighlight(); // You'd need to implement this
                      // }
                  } else {
                       console.warn("Settings update failed in content script:", response?.error);
                  }
             });
         }
  
         // 4. Handle specific immediate UI changes in the popup
         // if (e.target.name === 'display-mode') handleDisplayModeChange(e.target.value);
         if (e.target.id === 'searchHistoryEnabled') renderSearchHistory(); // Re-render history section visibility
    }
  
    // Helper to gather settings from the UI panel
    function gatherCurrentSettings() {
        const multiColors = Array.from(document.querySelectorAll('#multi-color-pickers input[type="color"]'))
                                 .map(picker => picker.value)
                                 .filter(color => color); // Get valid colors
  
        return {
            highlightColor: document.getElementById('highlight-color')?.value,
            // displayMode: document.querySelector('input[name="display-mode"]:checked')?.value,
            ignoreDiacritics: document.getElementById('ignoreDiacriticsSettingsCheckbox')?.checked, // Read from settings panel checkbox
            // animationSpeed: parseInt(document.getElementById('animationSpeed')?.value, 10), // Removed
            searchHistoryEnabled: document.getElementById('searchHistoryEnabled')?.checked,
            persistentHighlightsEnabled: document.getElementById('persistentHighlightsEnabled')?.checked,
            multiHighlightColors: multiColors
        };
    }
  
  
    // --- Search Handlers ---
    function handleSearch(rawSearchTerm) {
        if (!contentScriptReady || !activeTabId) return;
  
        // Split by comma, trim, filter empty terms
        const terms = rawSearchTerm.split(',').map(t => t.trim()).filter(t => t);
        if (terms.length === 0) { updateStatus("Please enter a search term.", true); return; }
  
        const caseSensitive = document.getElementById("caseSensitiveCheckbox")?.checked || false;
        const wholeWords = document.getElementById("wholeWordsCheckbox")?.checked || false;
        const ignoreDiacritics = document.getElementById('ignoreDiacriticsCheckbox')?.checked || false; // Use the GLOBAL checkbox for the actual search operation
        const excludeTerm = document.getElementById("excludeTermInput")?.value.trim() || "";
  
        // Check for wildcards to determine if regex should be used internally by highlight manager
        let treatAsRegex = terms.some(term => term.includes('*'));
         const processedTerms = terms.map(term => {
              // Highlight manager will handle escaping/processing based on useRegex flag
             return term;
         });
  
  
        const options = {
            caseSensitive, wholeWords, ignoreDiacritics, excludeTerm,
            useRegex: treatAsRegex, // Let highlight manager know if wildcards mean regex logic
            isProximity: false, // Not a proximity search
        };
  
        
        updateStatus("Searching...");
        sendSearchMessage("SEARCH_TEXT", { searchTerms: processedTerms, options });
    }
  
    function handleRegexSearch(searchTerm) {
        if (!contentScriptReady || !activeTabId || !searchTerm) return;
  
         const caseSensitive = document.getElementById("caseSensitiveCheckbox")?.checked || false;
         const ignoreDiacritics = document.getElementById('ignoreDiacriticsCheckbox')?.checked || false; // Use the GLOBAL checkbox
         const excludeTerm = document.getElementById("regexExcludeTermInput")?.value.trim() || ""; // Use regex-specific exclude input
  
         const options = {
             caseSensitive, ignoreDiacritics, excludeTerm,
             wholeWords: false, // N/A for direct regex
             useRegex: true,    // FORCE regex mode for highlight manager
             isProximity: false,
         };
  
         
         updateStatus("Searching regex...");
         sendSearchMessage("SEARCH_TEXT", { searchTerms: [searchTerm], options });
     }
  
  
    function handleProximitySearch() {
        if (!contentScriptReady || !activeTabId) return;
  
        const term1 = document.getElementById("proximityTerm1")?.value.trim();
        const term2 = document.getElementById("proximityTerm2")?.value.trim();
        const proximityValue = parseInt(document.getElementById("proximityValue")?.value || "10", 10);
  
        if (!term1 || !term2) {
            updateStatus("Please enter both proximity terms.", true);
            return;
        }
         if (isNaN(proximityValue) || proximityValue < 1) {
             updateStatus("Proximity distance must be 1 or greater.", true);
             return;
         }
  
  
        const caseSensitive = document.getElementById("caseSensitiveCheckbox")?.checked || false;
        const wholeWords = document.getElementById("wholeWordsCheckbox")?.checked || false;
        const ignoreDiacritics = document.getElementById('ignoreDiacriticsCheckbox')?.checked || false; // Use GLOBAL checkbox
        // Note: Exclude term is tricky for proximity. Maybe disable it or apply carefully?
        // Let's pass it for now, highlight manager's filter might handle it okay.
         const excludeTerm = ""; // Disabled for proximity for simplicity now
         // const excludeTerm = document.getElementById("excludeTermInput")?.value.trim() || ""; // If you want to try enabling it
  
  
        const options = {
            caseSensitive, wholeWords, ignoreDiacritics, excludeTerm,
            useRegex: false, // Proximity uses specific internal regex logic
            isProximity: true, // Flag for highlight manager
        };
  
        const payload = {
             searchTerm: term1,
             searchTerm2: term2,
             proximityValue: proximityValue,
             options: options
        };
  
        
        updateStatus("Searching proximity...");
        sendSearchMessage("SEARCH_PROXIMITY", payload);
  
        saveSearchHistory(`${term1} ~${proximityValue}~ ${term2}`);
    }
  
    function sendSearchMessage(type, payload) {
        chrome.tabs.sendMessage(activeTabId, { type, payload }, (response) => {
            if (chrome.runtime.lastError) {
                // Don't show error if popup closed during async response
                if (!chrome.runtime.lastError.message.includes("Receiving end does not exist")) {
                    console.error(`Error during ${type}:`, chrome.runtime.lastError.message);
                    updateStatus("Search failed: " + chrome.runtime.lastError.message, true);
                     if (chrome.runtime.lastError.message.includes("Could not establish connection")) {
                         contentScriptReady = false; // Mark as not ready
                         checkContentScript(); // Attempt to reconnect/reinject
                     }
                } else {
                    
                }
            } else if (response) {
                
                if (response.success) {
                     updateStatus(`Found ${response.count || 0} matches`, false); // Not an error
                     if (response.count > 0) {
                        setTimeout(() => {
                            chrome.tabs.sendMessage(activeTabId, { type: "RENDER_TICK_MARKS" }, r => {
                                if(chrome.runtime.lastError && !chrome.runtime.lastError.message.includes("Receiving end does not exist")) console.warn("Tick mark render error:", chrome.runtime.lastError.message);
                            });
                        }, 150); // Delay allows highlights to draw
                     } else {
                         chrome.tabs.sendMessage(activeTabId, { type: "CLEAR_TICK_MARKS" }, r => {
                            if(chrome.runtime.lastError && !chrome.runtime.lastError.message.includes("Receiving end does not exist")) console.warn("Tick mark clear error:", chrome.runtime.lastError.message);
                         });
                     }
                } else {
                     updateStatus(`Search failed: ${response.error || 'Unknown reason'}`, true);
                }
            } else {
                 // No response might also mean the content script isn't there
                 updateStatus("Search failed: No response from page.", true);
                 contentScriptReady = false;
                 checkContentScript();
            }
        });
    }
  
  
    // --- Navigation ---
    function handleNavigation(direction) {
        
        if (!contentScriptReady || !activeTabId) {
            console.warn("Cannot navigate: Extension not ready.");
            updateStatus("Navigation failed: Not ready", true);
            return;
        }
        chrome.tabs.sendMessage(activeTabId, { type: "NAVIGATE", payload: { direction } }, (response) => {
            if (chrome.runtime.lastError) {
                if (!chrome.runtime.lastError.message.includes("Receiving end does not exist")) {
                  console.error(`Navigation error (${direction}):`, chrome.runtime.lastError.message);
                  updateStatus("Navigation failed", true);
                  if (chrome.runtime.lastError.message.includes("Could not establish connection")) {
                      contentScriptReady = false; checkContentScript();
                  }
                }
            } else if (!response?.success) {
                console.warn("Navigation command failed in content script.");
                updateStatus("Navigation failed", true);
            } else {
                 
                 // No status update needed, highlight change is feedback
            }
        });
    }
  
    // --- Clear Highlights & History ---
    function handleClear() {
        
        // 1. Clear Highlights on Page
        if (activeTabId && contentScriptReady) {
            chrome.tabs.sendMessage(activeTabId, { type: "CLEAR_HIGHLIGHTS" }, r => {
                 if(chrome.runtime.lastError && !chrome.runtime.lastError.message.includes("Receiving end does not exist")) console.warn("Clear highlights error:", chrome.runtime.lastError.message);
            });
             chrome.tabs.sendMessage(activeTabId, { type: "CLEAR_TICK_MARKS" }, r => {
                 if(chrome.runtime.lastError && !chrome.runtime.lastError.message.includes("Receiving end does not exist")) console.warn("Clear ticks error:", chrome.runtime.lastError.message);
             });
        }
  
        // 2. Clear Input Fields
        const searchInput = document.getElementById("searchTermInput");
        const regexInput = document.getElementById("regexSearchInput");
        const excludeInput = document.getElementById("excludeTermInput");
        const regexExcludeInput = document.getElementById("regexExcludeTermInput");
        const prox1 = document.getElementById("proximityTerm1");
        const prox2 = document.getElementById("proximityTerm2");
        if (searchInput) searchInput.value = "";
        if (regexInput) regexInput.value = "";
        if (excludeInput) excludeInput.value = "";
        if (regexExcludeInput) regexExcludeInput.value = "";
        if (prox1) prox1.value = "";
        if (prox2) prox2.value = "";
  
        // 3. Clear Search History Storage and UI
        chrome.storage.sync.set({ searchHistory: [] }, () => {
            if (chrome.runtime.lastError) {
                console.error("Error clearing search history storage:", chrome.runtime.lastError.message);
                updateStatus("Error clearing history", true);
            } else {
                
                renderSearchHistory(); // Update the UI list
            }
        });
  
  
        lastExplicitSearchTerm = ""; // Reset last searched term
        updateStatus(""); // Clear status message
  
        // Focus the currently visible input field
        const isRegexMode = document.getElementById("regex-mode")?.checkVisibility();
        if (isRegexMode && regexInput) {
            regexInput.focus();
        } else if (searchInput) {
            searchInput.focus();
        }
    }
  
    // --- Export Highlights ---
    function handleExportHighlights() {
        
        if (!contentScriptReady || !activeTabId) {
            updateStatus("Cannot export: Not ready.", true);
            return;
        }
        updateStatus("Gathering highlights...");
  
        chrome.tabs.sendMessage(activeTabId, { type: "GET_HIGHLIGHTS_FOR_EXPORT" }, (response) => {
            if (chrome.runtime.lastError) {
                if (!chrome.runtime.lastError.message.includes("Receiving end does not exist")) {
                  console.error("Export error:", chrome.runtime.lastError.message);
                  updateStatus("Export failed: " + chrome.runtime.lastError.message, true);
                }
            } else if (response && response.success) {
                 if (response.highlights && response.highlights.length > 0) {
                     if (window.advancedFindExporter && window.advancedFindExporter.exportHighlights) {
                        // Could add format selection later
                        window.advancedFindExporter.exportHighlights(response.highlights, response.pageUrl, response.pageTitle, 'csv'); // Default to CSV
                        updateStatus(`Exported ${response.highlights.length} highlights.`);
                     } else {
                         console.error("Export function not found!");
                         updateStatus("Export failed: Export module error.", true);
                     }
                } else {
                    updateStatus("Nothing found to export.", false); // Not an error
                }
            } else {
                console.error("Export failed in content script:", response?.error);
                updateStatus(`Export failed: ${response?.error || 'Unknown error'}`, true);
            }
        });
    }
  
    // --- Search History ---
    function saveSearchHistory(term) {
         const historyEnabled = window.advancedFindConfig?.config?.settings?.searchHistoryEnabled ?? true;
        if (!term || !historyEnabled) return;
  
        chrome.storage.sync.get({ searchHistory: [] }, (result) => {
             if (chrome.runtime.lastError) {
                console.error("History save error (get):", chrome.runtime.lastError.message); return;
             }
            let history = Array.isArray(result.searchHistory) ? result.searchHistory : [];
            const termToSave = term.trim();
            if (!termToSave) return; // Don't save empty strings
  
            // Prevent duplicates
            history = history.filter(item => item !== termToSave);
            history.unshift(termToSave); // Add to the beginning
  
            const maxItems = window.advancedFindConfig?.config?.settings?.maxSearchHistory || MAX_HISTORY_ITEMS;
            if (history.length > maxItems) {
                history = history.slice(0, maxItems); // Limit size
            }
  
            chrome.storage.sync.set({ searchHistory: history }, () => {
                if (chrome.runtime.lastError) {
                    console.error("History save error (set):", chrome.runtime.lastError.message);
                } else {
                     
                     renderSearchHistory(); // Update UI
                }
            });
        });
    }
  
    async function renderSearchHistory() {
        const historyListElement = document.getElementById("recent-searches-list");
        const historySection = document.getElementById("search-history-section");
        if (!historyListElement || !historySection) {
            console.error("Search history UI elements not found.");
            return;
        }
  
        // Check if history is enabled via config (which should be updated from settings)
         const historyEnabled = window.advancedFindConfig?.config?.settings?.searchHistoryEnabled ?? true; // Default true if config/setting missing
  
        historySection.classList.toggle('hidden', !historyEnabled);
        if (!historyEnabled) {
            historyListElement.innerHTML = ''; // Clear list if disabled
            return;
        }
  
        historyListElement.innerHTML = '<li class="no-history">Loading...</li>'; // Loading state
  
        try {
            const history = await getSearchHistory();
            historyListElement.innerHTML = ''; // Clear loading/previous items
  
            if (history && history.length > 0) {
                history.forEach(term => {
                    const listItem = document.createElement("li");
                    listItem.textContent = term;
                    listItem.title = `Search for: ${term}`;
                    listItem.setAttribute('role', 'button');
                    listItem.tabIndex = 0; // Make focusable
  
                    // Use dedicated click/keyup handlers
                    const historyHandler = () => handleHistoryItemClick(term);
                    listItem.addEventListener("click", historyHandler);
                    listItem.addEventListener("keyup", (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault(); // Prevent space bar scrolling
                              historyHandler();
                        }
                    });
  
                    historyListElement.appendChild(listItem);
                });
            } else {
                historyListElement.innerHTML = '<li class="no-history">No recent searches</li>';
            }
        } catch (error) {
            console.error("Failed to render search history:", error);
            historyListElement.innerHTML = '<li class="no-history error">Could not load history</li>';
        }
    }
  
    function getSearchHistory() {
        return new Promise((resolve, reject) => {
            chrome.storage.sync.get({ searchHistory: [] }, (result) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve(Array.isArray(result.searchHistory) ? result.searchHistory : []);
                }
            });
        });
    }
  
    function handleHistoryItemClick(term) {
         
         const isRegexMode = !document.getElementById("regex-mode")?.classList.contains("hidden");
         const inputElement = document.getElementById(isRegexMode ? "regexSearchInput" : "searchTermInput");
         const searchButton = document.getElementById(isRegexMode ? "regexSearchButton" : "searchButton");
  
         if (inputElement) {
             inputElement.value = term;
             inputElement.focus();
             lastExplicitSearchTerm = term; // Set as last searched term explicitly
  
              // Trigger search immediately
              if (searchButton) {
                  searchButton.click(); // Preferred way
              } else {
                   // Fallback if button somehow not found
                   console.warn("Search button not found for history click, triggering manually.");
                  if (isRegexMode) { handleRegexSearch(term); }
                  else { handleSearch(term); }
              }
             // Note: Saving history again will move it to the top (handled by search handlers)
         } else {
             console.error("Could not find appropriate input field for history item.");
         }
    }
  
    // --- Mode Switching ---
    function switchToRegexMode() {
        
        document.getElementById("standard-mode")?.classList.add("hidden");
        document.getElementById("regex-mode")?.classList.remove("hidden");
        document.getElementById("proximity-controls")?.classList.add("hidden"); // Hide proximity
        const proxCheckbox = document.getElementById("proximitySearchCheckbox");
        if(proxCheckbox) proxCheckbox.checked = false; // Uncheck proximity
  
        updateStatus("Regex mode active.");
        lastExplicitSearchTerm = ""; // Reset last term
        document.getElementById("regexSearchInput")?.focus();
        document.getElementById("searchTermInput").value = ''; // Clear standard input
        document.getElementById("proximityTerm1").value = ''; // Clear prox inputs
        document.getElementById("proximityTerm2").value = '';
    }
  
    function returnToStandardMode() {
        
        document.getElementById("regex-mode")?.classList.add("hidden");
        document.getElementById("standard-mode")?.classList.remove("hidden");
        // Restore proximity visibility based on its own checkbox state
        setupProximitySearchUI();
  
        updateStatus(""); // Clear status
        lastExplicitSearchTerm = ""; // Reset last term
        document.getElementById("searchTermInput")?.focus();
        document.getElementById("regexSearchInput").value = ''; // Clear regex input
    }
  
     // --- Specific UI Setup ---
     function setupProximitySearchUI() {
        const proximitySearchCheckbox = document.getElementById("proximitySearchCheckbox");
        const proximitySearchContainer = document.getElementById("proximity-controls");
        if (!proximitySearchCheckbox || !proximitySearchContainer) {
             console.error("Cannot setup proximity UI - elements missing."); return;
         }
        // Set initial visibility based on checkbox state (might have been changed by mode switch)
        proximitySearchContainer.classList.toggle("hidden", !proximitySearchCheckbox.checked);
        // The main listener is added in setupEventListeners to avoid duplicates
     }
  
     function setupRegexMode() { // Sets up predefined options listeners
         
         const regexOptions = document.getElementsByName("regexOption");
         const input = document.getElementById("regexSearchInput");
         if (!input) { console.error("Regex input not found for options setup."); return; }
  
         regexOptions.forEach(option => {
              // Remove previous listener if any (using the stored reference wouldn't work easily here)
              // Instead, ensure setupEventListeners calls removeEventListeners first.
              const handler = (e) => {
                  if (!input) return;
                  let pattern = "";
                  const selectedValue = e.target.value;
                  switch (selectedValue) {
                      case "numbers": pattern = "\\b\\d{5,}\\b"; break;
                      case "emails": pattern = "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}"; break;
                      case "urls": pattern = "\\b(?:https?|ftp):\\/\\/[-A-Za-z0-9+&@#\\/%?=~_|!:,.;]*[-A-Za-z0-9+&@#\\/%=~_|]"; break;
                      // case "words": pattern = "\\b\\w+\\b"; break; // Less useful maybe?
                      case "custom": // Don't change input on 'custom' click
                      default: pattern = input.value; break; // Keep current value
                  }
                   if (selectedValue !== 'custom') { // Only update if not custom
                      input.value = pattern;
                      
                      input.focus();
                   }
              };
              addListener(option, "change", handler); // Use addListener to track
          });
         // Modal listeners are added in setupEventListeners
     }
  
      function setupSettingsPanel() {
          
          // Listeners for toggle, close, restore default, and input changes
          // are now added within setupEventListeners to ensure they can be removed.
      }
  
     // Handle display mode change (if keeping sidebar option)
     /*
    function handleDisplayModeChange(newMode) {
         
         if (newMode === 'sidebar') {
            window.close(); // Close the popup
            if (activeTabId) {
                 // Send message to background or content script to toggle sidebar
                 chrome.tabs.sendMessage(activeTabId, { type: "TOGGLE_SIDEBAR" }, (response) => {
                     if (chrome.runtime.lastError) console.warn("Error sending TOGGLE_SIDEBAR:", chrome.runtime.lastError.message);
                 });
            }
         } else {
             if (activeTabId) {
                 // Ask content script to clean up sidebar if it exists
                 chrome.tabs.sendMessage(activeTabId, { type: "CLEANUP_SIDEBAR" }, (response) => {
                      if (chrome.runtime.lastError) console.warn("Error sending CLEANUP_SIDEBAR:", chrome.runtime.lastError.message);
                 });
             }
         }
     }
     */
  
    // --- Start the process ---
    initializePopup();
  
  }); // End DOMContentLoaded