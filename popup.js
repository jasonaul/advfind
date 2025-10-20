document.addEventListener("DOMContentLoaded", () => {
    
    let activeTabId = null;
    let contentScriptReady = false;
    let retryCount = 0;
    const MAX_RETRIES = 5;
    const RETRY_DELAY = 200;
    let lastExplicitSearchTerm = "";
    const MAX_HISTORY_ITEMS = 10;
    const WORKSPACE_HISTORY_LIMIT = 10;
    const WORKSPACE_HISTORY_LOOKBACK_MS = 1000 * 60 * 60 * 24; // 24 hours

    const workspaceState = {
        lastQuery: null,
        tabResults: [],
        historyResults: [],
        isScanning: false
    };

    const patternState = {
        categories: [],
        selectedCategoryId: null,
        selectedPatternId: null
    };

    const MODES = Object.freeze({
        STANDARD: "standard",
        REGEX: "regex",
        PROXIMITY: "proximity"
    });
    const MODE_PANELS = {
        [MODES.STANDARD]: "standard-mode",
        [MODES.REGEX]: "regex-mode",
        [MODES.PROXIMITY]: "proximity-mode"
    };
    let currentMode = MODES.STANDARD;

  const listeners = []; // Store listeners to remove them later
  
    // --- Initialization ---
    function initializePopup() {
        
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            
            if (tabs && tabs[0]) {
                const tab = tabs[0];
                const url = tab.url;
                
                const restrictedPrefixes = ['chrome://', 'edge://', 'chrome-extension://', 'about:', 'view-source:'];
                const allowedPrefixes = ['http://', 'https://', 'file://'];
                if (!url || restrictedPrefixes.some(prefix => url.startsWith(prefix)) || !allowedPrefixes.some(prefix => url.startsWith(prefix))) {
                    const simpleUrl = url ? url.split('/')[0] : 'N/A';
                    console.warn(`[Popup] Cannot run on this page type: ${simpleUrl}`);
                    updateStatus(`Error: Cannot run on ${simpleUrl} pages`, "error");
                    disableUI();
                    return;
                }
                if (url.startsWith('file://')) { updateStatus("Warning: May not work correctly on local file URLs."); }

                activeTabId = tab.id;
                
                loadAndApplySettings(() => {
                    
                    checkContentScript(); // Check connection AFTER settings are ready
                    renderSearchHistory();
                    renderWorkspaceResults();
                    initializePatternLibrary();
                });
            } else {
                console.error("[Popup] No active tab found in query.");
                updateStatus("Error: No active tab found", "error");
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
  
    function getModeStatusId(mode) {
        switch (mode) {
            case MODES.REGEX:
                return "regex-status";
            case MODES.PROXIMITY:
                return "proximity-status";
            default:
                return "status";
        }
    }

    function setStatus(targetId, message = "", type = "info") {
        const element = document.getElementById(targetId);
        if (!element) return;

        element.textContent = message;
        element.classList.remove("error", "success", "loading");

        if (!message) return;

        if (type === "error") {
            element.classList.add("error");
        } else if (type === "success") {
            element.classList.add("success");
        } else if (type === "loading") {
            element.classList.add("loading");
        }
    }

    function clearAllModeStatuses() {
        setStatus("status");
        setStatus("regex-status");
        setStatus("proximity-status");
    }

    function updateStatus(message, type = "info") {
        const targetId = getModeStatusId(currentMode);
        setStatus(targetId, message, type);
    }

    function setInputError(inputElement, message, statusId) {
        if (!inputElement) return;
        inputElement.classList.add("input-error");
        inputElement.setAttribute("aria-invalid", "true");
        setStatus(statusId, message, "error");
    }

    function clearInputError(inputElement) {
        if (!inputElement) return;
        inputElement.classList.remove("input-error");
        inputElement.removeAttribute("aria-invalid");
    }

    function switchMode(mode, { focusInput = true } = {}) {
        if (!Object.values(MODES).includes(mode)) {
            mode = MODES.STANDARD;
        }

        currentMode = mode;

        const modeButtons = document.querySelectorAll('.mode-button');
        modeButtons.forEach(button => {
            const isActive = button.dataset.mode === mode;
            button.classList.toggle('active', isActive);
            button.setAttribute('aria-selected', String(isActive));
        });

        Object.entries(MODE_PANELS).forEach(([key, panelId]) => {
            const panel = document.getElementById(panelId);
            if (!panel) return;
            const shouldShow = key === mode;
            panel.classList.toggle('hidden', !shouldShow);
            panel.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');
        });

        Object.values(MODES).forEach(otherMode => {
            if (otherMode !== mode) {
                setStatus(getModeStatusId(otherMode));
            }
        });

        if (!focusInput) return;

        if (mode === MODES.STANDARD) {
            document.getElementById('searchTermInput')?.focus();
        } else if (mode === MODES.REGEX) {
            document.getElementById('regexSearchInput')?.focus();
        } else if (mode === MODES.PROXIMITY) {
            document.getElementById('proximityTerm1')?.focus();
        }
    }
  
  
    // --- Content Script Injection & Communication ---
    function checkContentScript() {
        if (!activeTabId) { console.error("[Popup] No active tab ID available for checkContentScript"); updateStatus("Error: Tab communication failed", "error"); disableUI(); return; }

        
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
              updateStatus("Initializing extension on page...", "loading");
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
          updateStatus("Error: Cannot connect to this page type", "error");
          disableUI();
          retryCount = 0; // Reset retries
          return;
      }
  
  
      if (retryCount < MAX_RETRIES) {
        retryCount++;
        updateStatus(`Connecting (${retryCount}/${MAX_RETRIES})...`, "loading");
        setTimeout(checkContentScript, RETRY_DELAY * retryCount); // Just re-check, don't inject again
    } else {
        console.error("[Popup] MAX RETRIES REACHED. Failed to establish connection with content script.");
        updateStatus("Error: Failed to connect to page content", "error");
        disableUI();
        retryCount = 0; // Reset for future attempts maybe?
    }
  }
  
  
    function injectContentScript() {
        
        // Ensure config is loaded globally before injection attempts rely on it.
        // Although background.js injects config.js first, being explicit can help debugging.
        if (!window.advancedFindConfig) {
            console.error("Config module not loaded before injection attempt!");
            updateStatus("Error: Extension files missing", "error");
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
                updateStatus("Error: Cannot access this page", "error");
            } else if (error.message.includes("Missing host permission")) {
                 updateStatus("Error: Extension needs permission for this URL", "error");
                 // Consider adding a button/link to request permissions if possible/desired
            } else if (error.message.includes("Failed to load")) {
                 updateStatus("Error: Could not load extension files", "error");
            }
            else {
                updateStatus("Error: Failed to initialize on page", "error");
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
       
       enableUI();

       removeEventListeners();
       setupEventListeners();

       setupSettingsPanel();
       setupRegexMode();

       if (window.advancedFindLiveSearch) {
           window.advancedFindLiveSearch.initializeLiveSearch(activeTabId, contentScriptReady);
           window.advancedFindLiveSearch.setupLiveSearchEventListeners();
       } else {
           console.error("[Popup] Live Search module not found!");
       }

       clearAllModeStatuses();
       switchMode(currentMode, { focusInput: false });
       syncInitialToggleStates();
       updateStatus("Ready");
   }
  
  
  
   function addListener(element, event, handler) { if (element) { element.addEventListener(event, handler); listeners.push({ element, event, handler }); } else { console.warn(`[Popup] Cannot add listener: Element not found for event ${event}`); } }
  
   function removeEventListeners() { listeners.forEach(({ element, event, handler }) => { if (element) { element.removeEventListener(event, handler); } }); listeners.length = 0; }
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

    function setupEventListeners() {
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
        const settingsButton = document.getElementById('settings-button');
        const closeSettings = document.getElementById('close-settings');
        const regexHelpButton = document.getElementById("regexHelpButton");
        const regexHelpClose = document.getElementById("regexHelpClose");
        const restoreDefaultButton = document.getElementById('restore-default-color');
        const settingsPanel = document.getElementById('settings-panel');
        const helpModal = document.getElementById("regexHelpModal");
        const workspaceSearchButton = document.getElementById("workspaceSearchButton");
        const workspaceSearchInput = document.getElementById("workspaceSearchInput");
        const workspaceRefreshButton = document.getElementById("workspaceRefreshButton");
        const patternCategorySelect = document.getElementById("patternCategorySelect");
        const patternSelect = document.getElementById("patternSelect");
        const patternRunButton = document.getElementById("patternRunButton");
        const patternWorkspaceButton = document.getElementById("patternWorkspaceButton");
        const patternApplyButton = document.getElementById("patternApplyButton");

        const modeButtons = document.querySelectorAll('.mode-button');
        modeButtons.forEach(button => {
            addListener(button, "click", () => {
                const desiredMode = button.dataset.mode;
                if (desiredMode) {
                    switchMode(desiredMode);
                }
            });
        });

        const toggleInputs = document.querySelectorAll('.checkbox-label input[type="checkbox"], .radio-label input[type="radio"]');
        toggleInputs.forEach(input => addListener(input, 'change', handleToggleChange));

        addListener(searchButton, "click", () => {
            if (!searchInput) return;
            const currentTerm = searchInput.value.trim();
            if (!currentTerm) {
                clearInputError(searchInput);
                setInputError(searchInput, "Please enter a search term.", getModeStatusId(MODES.STANDARD));
                return;
            }
            clearInputError(searchInput);
            if (currentTerm === lastExplicitSearchTerm && currentMode === MODES.STANDARD) {
                handleNavigation("next");
            } else {
                switchMode(MODES.STANDARD, { focusInput: false });
                lastExplicitSearchTerm = currentTerm;
                handleSearch(currentTerm);
                saveSearchHistory(currentTerm);
            }
        });
        addListener(searchInput, "keyup", (event) => { if (event.key === "Enter") searchButton?.click(); });

        addListener(clearButton, "click", handleClear);
        addListener(regexClearButton, "click", handleClear);

        addListener(nextButton, "click", () => handleNavigation("next"));
        addListener(prevButton, "click", () => handleNavigation("previous"));
        addListener(regexNextButton, "click", () => handleNavigation("next"));
        addListener(regexPrevButton, "click", () => handleNavigation("previous"));

        addListener(searchProximityButton, "click", () => {
            switchMode(MODES.PROXIMITY, { focusInput: false });
            handleProximitySearch();
        });

        addListener(exportButton, "click", handleExportHighlights);
        addListener(regexExportButton, "click", handleExportHighlights);

        addListener(regexSearchButton, "click", () => {
            if (!regexInput) return;
            const currentTerm = regexInput.value.trim();
            if (!currentTerm) {
                clearInputError(regexInput);
                setInputError(regexInput, "Enter a regex pattern.", getModeStatusId(MODES.REGEX));
                return;
            }
            clearInputError(regexInput);
            switchMode(MODES.REGEX, { focusInput: false });
            if (currentTerm === lastExplicitSearchTerm && currentMode === MODES.REGEX) {
                handleNavigation("next");
            } else {
                lastExplicitSearchTerm = currentTerm;
                handleRegexSearch(currentTerm);
                saveSearchHistory(currentTerm);
            }
        });
        addListener(regexInput, "keyup", (event) => { if (event.key === "Enter") regexSearchButton?.click(); });

        addListener(workspaceSearchButton, "click", () => runWorkspaceSearch());
        addListener(workspaceRefreshButton, "click", () => runWorkspaceSearch({ reuseLast: true }));
        addListener(workspaceSearchInput, "keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                runWorkspaceSearch();
            }
        });

        addListener(patternCategorySelect, "change", (event) => handlePatternCategoryChange(event.target.value));
        addListener(patternSelect, "change", (event) => handlePatternSelectChange(event.target.value));
        addListener(patternRunButton, "click", runSelectedPatternOnActiveTab);
        addListener(patternWorkspaceButton, "click", runSelectedPatternWorkspaceScan);
        addListener(patternApplyButton, "click", loadPatternIntoSearch);

        addListener(settingsButton, 'click', () => settingsPanel?.classList.remove('hidden'));
        addListener(closeSettings, 'click', () => settingsPanel?.classList.add('hidden'));
        addListener(settingsPanel, 'click', (e) => { if (e.target === settingsPanel) settingsPanel.classList.add('hidden'); });
        addListener(restoreDefaultButton, 'click', () => {
            if (highlightColorPicker && window.advancedFindConfig) {
                const defaultColor = window.advancedFindConfig.config.settings.defaultHighlightColor || "#ffff00";
                highlightColorPicker.value = defaultColor;
                highlightColorPicker.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });
        const settingsInputs = settingsPanel?.querySelectorAll('input, select');
        settingsInputs?.forEach(input => {
            addListener(input, 'change', handleSettingChange);
            if ((input.type === 'checkbox' || input.type === 'radio') && input.closest('.checkbox-label, .radio-label')) {
                addListener(input, 'change', handleToggleChange);
            }
        });

        addListener(regexHelpButton, "click", () => helpModal?.classList.remove("hidden"));
        addListener(regexHelpClose, "click", () => helpModal?.classList.add("hidden"));
        addListener(helpModal, 'click', (e) => { if (e.target === helpModal) helpModal.classList.add('hidden'); });
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
                updateStatus("Error saving settings", "error");
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
        switchMode(MODES.STANDARD, { focusInput: false });
  
        // Split by comma, trim, filter empty terms
        const terms = rawSearchTerm.split(',').map(t => t.trim()).filter(t => t);
        const searchInput = document.getElementById("searchTermInput");
        clearInputError(searchInput);
        if (terms.length === 0) {
            setInputError(searchInput, "Please enter a search term.", getModeStatusId(MODES.STANDARD));
            return;
        }
  
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
  
        updateStatus("Searching...", "loading");
        sendSearchMessage("SEARCH_TEXT", { searchTerms: processedTerms, options });
    }
  
    function handleRegexSearch(searchTerm) {
        if (!contentScriptReady || !activeTabId || !searchTerm) return;
        switchMode(MODES.REGEX, { focusInput: false });

        const regexInput = document.getElementById("regexSearchInput");
        clearInputError(regexInput);
        if (!searchTerm.trim()) {
            setInputError(regexInput, "Enter a regex pattern.", getModeStatusId(MODES.REGEX));
            return;
        }
  
         const caseSensitive = document.getElementById("caseSensitiveCheckbox")?.checked || false;
         const ignoreDiacritics = document.getElementById('ignoreDiacriticsCheckbox')?.checked || false; // Use the GLOBAL checkbox
         const excludeTerm = document.getElementById("regexExcludeTermInput")?.value.trim() || ""; // Use regex-specific exclude input
  
         const options = {
             caseSensitive, ignoreDiacritics, excludeTerm,
             wholeWords: false, // N/A for direct regex
             useRegex: true,    // FORCE regex mode for highlight manager
             isProximity: false,
         };
  
         updateStatus("Searching regex...", "loading");
         sendSearchMessage("SEARCH_TEXT", { searchTerms: [searchTerm], options });
     }
  
  
    function handleProximitySearch() {
        if (!contentScriptReady || !activeTabId) return;
        switchMode(MODES.PROXIMITY, { focusInput: false });
  
        const term1 = document.getElementById("proximityTerm1")?.value.trim();
        const term2 = document.getElementById("proximityTerm2")?.value.trim();
        const proximityValue = parseInt(document.getElementById("proximityValue")?.value || "10", 10);
        const distanceTypeSelect = document.getElementById("proximityDistanceType");
        const distanceType = distanceTypeSelect?.value === "chars" ? "chars" : "words";
        const requireOrder = document.getElementById("proximityOrderCheckbox")?.checked || false;
        const sameParagraph = document.getElementById("proximitySameParagraphCheckbox")?.checked || false;

        const term1Input = document.getElementById("proximityTerm1");
        const term2Input = document.getElementById("proximityTerm2");
        const distanceInput = document.getElementById("proximityValue");
        clearInputError(term1Input);
        clearInputError(term2Input);
        clearInputError(distanceInput);

        if (!term1 || !term2) {
            const warnings = [];
            const statusId = getModeStatusId(MODES.PROXIMITY);
            if (!term1) {
                term1Input?.classList.add("input-error");
                term1Input?.setAttribute("aria-invalid", "true");
                warnings.push("Enter the first term.");
            }
            if (!term2) {
                term2Input?.classList.add("input-error");
                term2Input?.setAttribute("aria-invalid", "true");
                warnings.push("Enter the second term.");
            }
            setStatus(statusId, warnings.join(' '), "error");
            return;
        }
         if (isNaN(proximityValue) || proximityValue < 1) {
             setInputError(distanceInput, "Distance must be 1 or greater.", getModeStatusId(MODES.PROXIMITY));
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
            caseSensitive,
            wholeWords,
            ignoreDiacritics,
            excludeTerm,
            useRegex: false, // Proximity uses specific internal regex logic
            isProximity: true, // Flag for highlight manager
            distanceType,
            requireOrder,
            sameParagraph
        };

        const payload = {
             searchTerm: term1,
             searchTerm2: term2,
             proximityValue: proximityValue,
             options: options
        };

         
        updateStatus("Searching proximity...", "loading");
        sendSearchMessage("SEARCH_PROXIMITY", payload);
  
        saveSearchHistory(`${term1} ~${proximityValue}~ ${term2}`);
    }
  
    function sendSearchMessage(type, payload) {
        chrome.tabs.sendMessage(activeTabId, { type, payload }, (response) => {
            if (chrome.runtime.lastError) {
                // Don't show error if popup closed during async response
                if (!chrome.runtime.lastError.message.includes("Receiving end does not exist")) {
                    console.error(`Error during ${type}:`, chrome.runtime.lastError.message);
                    updateStatus("Search failed: " + chrome.runtime.lastError.message, "error");
                     if (chrome.runtime.lastError.message.includes("Could not establish connection")) {
                         contentScriptReady = false; // Mark as not ready
                         checkContentScript(); // Attempt to reconnect/reinject
                     }
                } else {
                    
                }
            } else if (response) {
                
                if (response.success) {
                     updateStatus(`Found ${response.count || 0} matches`, response.count > 0 ? "success" : "info");
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
                     updateStatus(`Search failed: ${response.error || 'Unknown reason'}`, "error");
                }
            } else {
                 // No response might also mean the content script isn't there
                 updateStatus("Search failed: No response from page.", "error");
                 contentScriptReady = false;
                 checkContentScript();
            }
        });
    }
  
  
    // --- Navigation ---
    function handleNavigation(direction) {
        
        if (!contentScriptReady || !activeTabId) {
            console.warn("Cannot navigate: Extension not ready.");
            updateStatus("Navigation failed: Not ready", "error");
            return;
        }
        chrome.tabs.sendMessage(activeTabId, { type: "NAVIGATE", payload: { direction } }, (response) => {
            if (chrome.runtime.lastError) {
                if (!chrome.runtime.lastError.message.includes("Receiving end does not exist")) {
                  console.error(`Navigation error (${direction}):`, chrome.runtime.lastError.message);
                  updateStatus("Navigation failed", "error");
                  if (chrome.runtime.lastError.message.includes("Could not establish connection")) {
                      contentScriptReady = false; checkContentScript();
                  }
                }
            } else if (!response?.success) {
                console.warn("Navigation command failed in content script.");
                updateStatus("Navigation failed", "error");
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
        if (searchInput) {
            searchInput.value = "";
            clearInputError(searchInput);
        }
        if (regexInput) {
            regexInput.value = "";
            clearInputError(regexInput);
        }
        if (excludeInput) excludeInput.value = "";
        if (regexExcludeInput) regexExcludeInput.value = "";
        if (prox1) {
            prox1.value = "";
            clearInputError(prox1);
        }
        if (prox2) {
            prox2.value = "";
            clearInputError(prox2);
        }
  
        // 3. Clear Search History Storage and UI
        chrome.storage.sync.set({ searchHistory: [] }, () => {
            if (chrome.runtime.lastError) {
                console.error("Error clearing search history storage:", chrome.runtime.lastError.message);
                updateStatus("Error clearing history", "error");
            } else {
                
                renderSearchHistory(); // Update the UI list
            }
        });
  
  
        lastExplicitSearchTerm = ""; // Reset last searched term
        updateStatus(""); // Clear status message

        switchMode(currentMode, { focusInput: true });
    }
  
    // --- Export Highlights ---
    function handleExportHighlights() {
        
        if (!contentScriptReady || !activeTabId) {
            updateStatus("Cannot export: Not ready.", "error");
            return;
        }
        updateStatus("Gathering highlights...", "loading");
  
        chrome.tabs.sendMessage(activeTabId, { type: "GET_HIGHLIGHTS_FOR_EXPORT" }, (response) => {
            if (chrome.runtime.lastError) {
                if (!chrome.runtime.lastError.message.includes("Receiving end does not exist")) {
                  console.error("Export error:", chrome.runtime.lastError.message);
                  updateStatus("Export failed: " + chrome.runtime.lastError.message, "error");
                }
            } else if (response && response.success) {
                 if (response.highlights && response.highlights.length > 0) {
                     if (window.advancedFindExporter && window.advancedFindExporter.exportHighlights) {
                        // Could add format selection later
                        window.advancedFindExporter.exportHighlights(response.highlights, response.pageUrl, response.pageTitle, 'csv'); // Default to CSV
                        updateStatus(`Exported ${response.highlights.length} highlights.`, "success");
                     } else {
                         console.error("Export function not found!");
                         updateStatus("Export failed: Export module error.", "error");
                     }
                } else {
                    updateStatus("Nothing found to export.", "info");
                }
            } else {
                console.error("Export failed in content script:", response?.error);
                updateStatus(`Export failed: ${response?.error || 'Unknown error'}`, "error");
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
        const isRegexMode = currentMode === MODES.REGEX;
        switchMode(isRegexMode ? MODES.REGEX : MODES.STANDARD, { focusInput: false });
        const inputElement = document.getElementById(isRegexMode ? "regexSearchInput" : "searchTermInput");
        const searchButton = document.getElementById(isRegexMode ? "regexSearchButton" : "searchButton");
  
        if (inputElement) {
            clearInputError(inputElement);
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

    // --- Workspace Search ---
    function updateWorkspaceStatus(message = "", type = "info") {
        setStatus("workspace-status", message, type);
    }

    function setWorkspaceBusy(isBusy) {
        workspaceState.isScanning = isBusy;
        const searchButton = document.getElementById("workspaceSearchButton");
        const refreshButton = document.getElementById("workspaceRefreshButton");
        const input = document.getElementById("workspaceSearchInput");
        const patternWorkspaceButton = document.getElementById("patternWorkspaceButton");
        const workspaceSection = document.getElementById("workspace-section");
        if (searchButton) searchButton.disabled = isBusy;
        if (input) input.disabled = isBusy;
        if (refreshButton) refreshButton.disabled = isBusy || !workspaceState.lastQuery;
        if (patternWorkspaceButton) patternWorkspaceButton.disabled = isBusy || !patternState.selectedPatternId;
        if (workspaceSection) workspaceSection.classList.toggle("loading", isBusy);
        syncPatternButtonStates();
    }

    function renderWorkspaceResults(tabResults = workspaceState.tabResults, historyResults = workspaceState.historyResults) {
        const container = document.getElementById("workspace-results");
        const refreshButton = document.getElementById("workspaceRefreshButton");
        if (!container) return;

        container.innerHTML = "";

        const combined = [];
        if (Array.isArray(tabResults) && tabResults.length) combined.push(...tabResults);
        if (Array.isArray(historyResults) && historyResults.length) combined.push(...historyResults);

        if (combined.length === 0) {
            const emptyState = document.createElement("div");
            emptyState.className = "workspace-result";
            const lastQuery = workspaceState.lastQuery;
            const emptyMessage = lastQuery?.patternInfo
                ? `No matches found for pattern "${lastQuery.patternInfo.patternLabel}".`
                : (lastQuery ? "No matches found. Adjust your terms and try again." : "Run a workspace scan to see results here.");
            emptyState.textContent = emptyMessage;
            container.appendChild(emptyState);
        } else {
            combined
                .sort((a, b) => (b.totalMatches || 0) - (a.totalMatches || 0))
                .forEach(result => container.appendChild(buildWorkspaceResultCard(result)));
        }

        if (refreshButton) {
            refreshButton.disabled = workspaceState.isScanning || !workspaceState.lastQuery;
        }
    }

    function updatePatternStatus(message = "", type = "info") {
        setStatus("pattern-status", message, type);
    }

    function syncPatternButtonStates() {
        const hasPattern = !!getSelectedPatternEntry();
        const runButton = document.getElementById("patternRunButton");
        const workspaceButton = document.getElementById("patternWorkspaceButton");
        const applyButton = document.getElementById("patternApplyButton");
        if (runButton) runButton.disabled = !hasPattern;
        if (applyButton) applyButton.disabled = !hasPattern;
        if (workspaceButton) workspaceButton.disabled = !hasPattern || workspaceState.isScanning;
    }

    function initializePatternLibrary() {
        const categorySelect = document.getElementById("patternCategorySelect");
        const patternSelect = document.getElementById("patternSelect");
        if (!categorySelect || !patternSelect) return;

        const categories = window.advancedFindPatternLibrary?.getCategories?.() || [];
        patternState.categories = categories;

        categorySelect.innerHTML = "";
        patternSelect.innerHTML = "";

        if (!categories.length) {
            categorySelect.disabled = true;
            patternSelect.disabled = true;
            patternState.selectedCategoryId = null;
            patternState.selectedPatternId = null;
            updatePatternDetails();
            updatePatternStatus("No patterns available.");
            syncPatternButtonStates();
            return;
        }

        categorySelect.disabled = false;
        patternSelect.disabled = false;

        categories.forEach(category => {
            const option = document.createElement("option");
            option.value = category.id;
            option.textContent = category.label;
            categorySelect.appendChild(option);
        });

        const initialCategory = categories.find(category => category.id === patternState.selectedCategoryId) || categories[0];
        patternState.selectedCategoryId = initialCategory.id;
        categorySelect.value = initialCategory.id;
        populatePatternSelect(initialCategory.id);
    }

    function populatePatternSelect(categoryId) {
        const patternSelect = document.getElementById("patternSelect");
        if (!patternSelect) return;

        const categoryEntry = window.advancedFindPatternLibrary?.getCategoryById?.(categoryId);
        patternSelect.innerHTML = "";

        if (!categoryEntry || !Array.isArray(categoryEntry.patterns) || !categoryEntry.patterns.length) {
            patternState.selectedPatternId = null;
            updatePatternDetails();
            updatePatternStatus("No patterns defined for this category.");
            syncPatternButtonStates();
            return;
        }

        categoryEntry.patterns.forEach(pattern => {
            const option = document.createElement("option");
            option.value = pattern.id;
            option.textContent = pattern.label;
            patternSelect.appendChild(option);
        });

        const initialPattern = categoryEntry.patterns.find(pattern => pattern.id === patternState.selectedPatternId) || categoryEntry.patterns[0];
        patternState.selectedPatternId = initialPattern.id;
        patternSelect.value = initialPattern.id;
        updatePatternDetails();
        updatePatternStatus("", false);
        syncPatternButtonStates();
    }

    function handlePatternCategoryChange(categoryId) {
        patternState.selectedCategoryId = categoryId;
        populatePatternSelect(categoryId);
    }

    function handlePatternSelectChange(patternId) {
        patternState.selectedPatternId = patternId;
        updatePatternDetails();
        updatePatternStatus("", false);
        syncPatternButtonStates();
    }

    function updatePatternDetails() {
        const descriptionElement = document.getElementById("patternDescription");
        const tagsElement = document.getElementById("patternTags");

        const entry = getSelectedPatternEntry();
        if (!entry) {
            if (descriptionElement) descriptionElement.textContent = "Select a pattern to see details.";
            if (tagsElement) tagsElement.innerHTML = "";
            return;
        }

        if (descriptionElement) {
            descriptionElement.textContent = entry.pattern.description || "No description provided.";
        }

        if (tagsElement) {
            tagsElement.innerHTML = "";

            const createTag = (label) => {
                const tag = document.createElement("span");
                tag.className = "pattern-tag";
                tag.textContent = label;
                tagsElement.appendChild(tag);
            };

            createTag(entry.category.label);
            if (entry.pattern.options?.useRegex) createTag("Regex");
            if (entry.pattern.options?.caseSensitive) createTag("Case sensitive");
            if (entry.pattern.options?.wholeWords) createTag("Whole words");
            if (entry.pattern.options?.ignoreDiacritics) createTag("Ignore diacritics");
            (entry.pattern.tags || []).forEach(tag => createTag(tag));
        }
    }

    function getSelectedPatternEntry() {
        if (!patternState.selectedPatternId) return null;
        return window.advancedFindPatternLibrary?.getPatternById?.(patternState.selectedPatternId) || null;
    }

    function normalizePatternOptions(pattern) {
        const options = pattern?.options || {};
        return {
            caseSensitive: !!options.caseSensitive,
            wholeWords: !!options.wholeWords,
            ignoreDiacritics: !!options.ignoreDiacritics,
            excludeTerm: options.excludeTerm || "",
            useRegex: !!options.useRegex
        };
    }

    function createPatternMetadata(pattern, category) {
        if (!pattern) return null;
        return {
            patternId: pattern.id,
            patternLabel: pattern.label,
            categoryId: category?.id || null,
            categoryLabel: category?.label || null,
            description: pattern.description || "",
            tags: Array.isArray(pattern.tags) ? pattern.tags : []
        };
    }

    function runSelectedPatternOnActiveTab() {
        const entry = getSelectedPatternEntry();
        if (!entry) {
            updatePatternStatus("Select a pattern before running.", "error");
            return;
        }
        executePatternOnActiveTab(entry);
    }

    function executePatternOnActiveTab(entry) {
        if (!contentScriptReady || !activeTabId) {
            updatePatternStatus("Cannot run pattern: active tab not ready.", "error");
            return;
        }

        const { category, pattern } = entry;
        const options = normalizePatternOptions(pattern);
        const metadata = createPatternMetadata(pattern, category);
        options.patternMetadata = metadata;

        updatePatternStatus(`Running "${pattern.label}" on this page...`, "loading");

        chrome.tabs.sendMessage(activeTabId, {
            type: "SEARCH_TEXT",
            payload: {
                searchTerms: Array.isArray(pattern.terms) ? pattern.terms : [pattern.terms],
                options
            }
        }, (response) => {
            if (chrome.runtime.lastError) {
                const message = chrome.runtime.lastError.message;
                if (!message.includes("Receiving end does not exist")) {
                    console.error("Pattern search error:", message);
                    updatePatternStatus("Pattern search failed: " + message, "error");
                }
                return;
            }

            if (response && response.success) {
                const count = response.count || 0;
                updatePatternStatus(`Found ${count} match${count === 1 ? "" : "es"} for "${pattern.label}".`, count > 0 ? "success" : "info");
                if (count > 0) {
                    setTimeout(() => {
                        chrome.tabs.sendMessage(activeTabId, { type: "RENDER_TICK_MARKS" }, () => void chrome.runtime.lastError);
                    }, 150);
                } else {
                    chrome.tabs.sendMessage(activeTabId, { type: "CLEAR_TICK_MARKS" }, () => void chrome.runtime.lastError);
                }
            } else {
                updatePatternStatus(response?.error ? `Pattern search failed: ${response.error}` : "Pattern search failed.", "error");
            }
        });
    }

    function runSelectedPatternWorkspaceScan() {
        const entry = getSelectedPatternEntry();
        if (!entry) {
            updatePatternStatus("Select a pattern before scanning workspace.", "error");
            return;
        }
        const query = createWorkspaceQueryFromPattern(entry);
        if (!query) {
            updatePatternStatus("Unable to build workspace query for pattern.", "error");
            return;
        }
        updatePatternStatus(`Scanning workspace for pattern "${entry.pattern.label}"...`, "loading");
        runWorkspaceSearch({ explicitQuery: query });
    }

    function createWorkspaceQueryFromPattern(entry) {
        const { category, pattern } = entry;
        const options = normalizePatternOptions(pattern);
        const metadata = createPatternMetadata(pattern, category);
        options.patternMetadata = metadata;

        const includeHistory = document.getElementById("workspaceIncludeHistory")?.checked || false;
        const includeAllWindows = document.getElementById("workspaceAllWindows")?.checked || false;
        const termsArray = Array.isArray(pattern.terms) ? pattern.terms : [pattern.terms];

        return {
            termString: termsArray.join(", "),
            terms: termsArray,
            options,
            includeHistory,
            includeAllWindows,
            patternInfo: metadata
        };
    }

    function loadPatternIntoSearch() {
        const entry = getSelectedPatternEntry();
        if (!entry) {
            updatePatternStatus("Select a pattern to load into search.", "error");
            return;
        }

        const { pattern } = entry;
        const options = normalizePatternOptions(pattern);
        const termsArray = Array.isArray(pattern.terms) ? pattern.terms : [pattern.terms];

        if (pattern.options?.useRegex && termsArray.length === 1) {
            switchMode(MODES.REGEX, { focusInput: false });
            const regexInput = document.getElementById("regexSearchInput");
            if (regexInput) {
                clearInputError(regexInput);
                regexInput.value = termsArray[0];
                regexInput.focus();
            }
        } else {
            switchMode(MODES.STANDARD, { focusInput: false });
            const searchInput = document.getElementById("searchTermInput");
            if (searchInput) {
                clearInputError(searchInput);
                searchInput.value = termsArray.join(", ");
                searchInput.focus();
            }
        }

        const workspaceInput = document.getElementById("workspaceSearchInput");
        if (workspaceInput) {
            workspaceInput.value = termsArray.join(", ");
        }

        const caseCheckbox = document.getElementById("caseSensitiveCheckbox");
        if (caseCheckbox) {
            caseCheckbox.checked = !!options.caseSensitive;
            handleToggleChange({ target: caseCheckbox });
        }

        const wholeWordsCheckbox = document.getElementById("wholeWordsCheckbox");
        if (wholeWordsCheckbox) {
            wholeWordsCheckbox.checked = !!options.wholeWords;
            handleToggleChange({ target: wholeWordsCheckbox });
        }

        const ignoreDiacriticsCheckbox = document.getElementById("ignoreDiacriticsCheckbox");
        if (ignoreDiacriticsCheckbox) {
            ignoreDiacriticsCheckbox.checked = !!options.ignoreDiacritics;
            handleToggleChange({ target: ignoreDiacriticsCheckbox });
        }

        const excludeInput = document.getElementById("excludeTermInput");
        if (excludeInput) {
            excludeInput.value = options.excludeTerm || "";
        }

        updatePatternStatus("Pattern loaded into search controls.", "success");
    }

    function buildWorkspaceQuery(termString) {
        const rawTerms = termString.split(',').map(t => t.trim()).filter(Boolean);
        if (rawTerms.length === 0) {
            return null;
        }

        const caseSensitive = document.getElementById("caseSensitiveCheckbox")?.checked || false;
        const wholeWords = document.getElementById("wholeWordsCheckbox")?.checked || false;
        const ignoreDiacritics = document.getElementById("ignoreDiacriticsCheckbox")?.checked || false;
        const excludeTerm = document.getElementById("excludeTermInput")?.value.trim() || "";
        const includeHistory = document.getElementById("workspaceIncludeHistory")?.checked || false;
        const includeAllWindows = document.getElementById("workspaceAllWindows")?.checked || false;
        const useRegex = rawTerms.some(term => term.includes('*'));

        return {
            termString,
            terms: rawTerms,
            options: { caseSensitive, wholeWords, ignoreDiacritics, excludeTerm, useRegex },
            includeHistory,
            includeAllWindows,
            patternInfo: null
        };
    }

    async function runWorkspaceSearch({ reuseLast = false, explicitQuery = null } = {}) {
        if (workspaceState.isScanning) return;

        const inputElement = document.getElementById("workspaceSearchInput");
        if (!inputElement) return;

        let query = explicitQuery;

        clearInputError(inputElement);

        if (!query) {
            let termString = reuseLast && workspaceState.lastQuery ? workspaceState.lastQuery.termString : inputElement.value.trim();
            if (!termString && workspaceState.lastQuery) {
                termString = workspaceState.lastQuery.termString;
            }

            query = buildWorkspaceQuery(termString || "");
            if (!query) {
                inputElement.classList.add("input-error");
                inputElement.setAttribute("aria-invalid", "true");
                updateWorkspaceStatus("Enter at least one search term.", "error");
                return;
            }
        }

        workspaceState.lastQuery = query;
        inputElement.value = query.termString;

        setWorkspaceBusy(true);
        updateWorkspaceStatus("Scanning workspace...", "loading");

        try {
            const tabResults = await scanTabsForMatches(query);
            workspaceState.tabResults = tabResults;

            const historyResults = query.includeHistory ? await scanHistoryForMatches(query, tabResults) : [];
            workspaceState.historyResults = historyResults;

            renderWorkspaceResults(tabResults, historyResults);

            const tabTotal = tabResults.reduce((sum, item) => sum + (item.totalMatches || 0), 0);
            const historyTotal = historyResults.reduce((sum, item) => sum + (item.totalMatches || 0), 0);
            const aggregate = tabTotal + historyTotal;

            const patternLabel = query.patternInfo?.patternLabel;
            if (aggregate > 0) {
                updateWorkspaceStatus(patternLabel ? `Found ${aggregate} matches for pattern "${patternLabel}" across workspace.` : `Found ${aggregate} matches across workspace.`, "success");
                if (patternLabel) {
                    updatePatternStatus(`Workspace scan complete: ${aggregate} matches for "${patternLabel}".`, "success");
                }
            } else {
                updateWorkspaceStatus(patternLabel ? `No matches found for pattern "${patternLabel}" across workspace.` : "No matches found across workspace.", "info");
                if (patternLabel) {
                    updatePatternStatus(`No matches found for "${patternLabel}" across workspace.`, "info");
                }
            }
        } catch (error) {
            console.error("Workspace scan failed:", error);
            updateWorkspaceStatus(`Workspace scan failed: ${error.message || error}`, "error");
            if (query.patternInfo?.patternLabel) {
                updatePatternStatus(`Workspace scan failed for "${query.patternInfo.patternLabel}": ${error.message || error}`, "error");
            }
        } finally {
            setWorkspaceBusy(false);
        }
    }

    function buildWorkspaceResultCard(result) {
        const card = document.createElement("div");
        card.className = `workspace-result${(result.totalMatches || 0) === 0 ? " zero" : ""}`;

        const header = document.createElement("div");
        header.className = "workspace-result-header";

        const titleContainer = document.createElement("div");
        titleContainer.className = "workspace-result-title";

        const title = document.createElement("span");
        title.textContent = result.title || result.url || (result.type === "tab" ? "Unnamed tab" : "History entry");
        title.title = title.textContent;

        const urlMeta = document.createElement("div");
        urlMeta.className = "workspace-result-meta";
        if (result.url) {
            urlMeta.textContent = result.url;
            urlMeta.title = result.url;
        } else {
            urlMeta.textContent = result.type === "history" ? "History entry" : "Active tab";
        }

        titleContainer.appendChild(title);
        titleContainer.appendChild(urlMeta);

        const totalBadge = document.createElement("span");
        totalBadge.className = "workspace-result-meta";
        totalBadge.textContent = `${result.totalMatches || 0} match${(result.totalMatches || 0) === 1 ? "" : "es"}`;

        header.appendChild(titleContainer);
        header.appendChild(totalBadge);
        card.appendChild(header);

        if (result.patternInfo?.patternLabel) {
            const patternMeta = document.createElement("div");
            patternMeta.className = "workspace-result-meta";
            patternMeta.textContent = `Pattern: ${result.patternInfo.patternLabel}`;
            card.appendChild(patternMeta);

            if (Array.isArray(result.patternInfo.tags) && result.patternInfo.tags.length) {
                const tagsRow = document.createElement("div");
                tagsRow.className = "workspace-result-meta";
                tagsRow.textContent = `Tags: ${result.patternInfo.tags.join(", ")}`;
                card.appendChild(tagsRow);
            }
        }

        if (Array.isArray(result.perTerm) && result.perTerm.length) {
            const termBreakdown = document.createElement("div");
            termBreakdown.className = "workspace-result-meta";
            termBreakdown.textContent = result.perTerm
                .map(entry => entry.error ? `${entry.term}: error` : `${entry.term}: ${entry.count ?? 0}`)
                .join(" • ");
            card.appendChild(termBreakdown);
        }

        if (result.error) {
            const errorLine = document.createElement("div");
            errorLine.className = "workspace-result-meta";
            errorLine.textContent = `Error: ${result.error}`;
            card.appendChild(errorLine);
        }

        const actions = document.createElement("div");
        actions.className = "workspace-result-actions";

        if (result.type === "tab") {
            const focusBtn = document.createElement("button");
            focusBtn.className = "secondary-button compact";
            focusBtn.textContent = "Focus tab";
            focusBtn.addEventListener("click", () => focusWorkspaceTab(result));

            const highlightBtn = document.createElement("button");
            highlightBtn.className = "secondary-button compact";
            highlightBtn.textContent = "Highlight";
            highlightBtn.addEventListener("click", () => highlightWorkspaceTab(result));

            actions.appendChild(focusBtn);
            actions.appendChild(highlightBtn);
        } else if (result.type === "history") {
            const openBtn = document.createElement("button");
            openBtn.className = "secondary-button compact";
            openBtn.textContent = "Open page";
            openBtn.addEventListener("click", () => openHistoryResult(result));
            actions.appendChild(openBtn);
        }

        if (actions.childElementCount > 0) {
            card.appendChild(actions);
        }

        return card;
    }

    function isUrlEligibleForWorkspace(url) {
        if (!url) return false;
        const restrictedPrefixes = ['chrome://', 'edge://', 'chrome-extension://', 'about:', 'view-source:', 'devtools://', 'chrome-search://'];
        return !restrictedPrefixes.some(prefix => url.startsWith(prefix));
    }

    function scanTabsForMatches(query) {
        return new Promise((resolve) => {
            const tabQuery = query.includeAllWindows ? {} : { currentWindow: true };
            chrome.tabs.query(tabQuery, (tabs) => {
                if (chrome.runtime.lastError) {
                    console.error("tabs.query failed:", chrome.runtime.lastError.message);
                    resolve([]);
                    return;
                }

                const eligibleTabs = (tabs || []).filter(tab => isUrlEligibleForWorkspace(tab.url));
                if (eligibleTabs.length === 0) {
                    resolve([]);
                    return;
                }

                const payload = {
                    searchTerms: query.terms,
                    options: {
                        caseSensitive: query.options.caseSensitive,
                        wholeWords: query.options.wholeWords,
                        ignoreDiacritics: query.options.ignoreDiacritics,
                        excludeTerm: query.options.excludeTerm,
                        useRegex: query.options.useRegex,
                        patternMetadata: query.options.patternMetadata || null
                    }
                };

                Promise.all(eligibleTabs.map(tab => countMatchesInTab(tab, payload, query.patternInfo || null))).then(resolve);
            });
        });
    }

    function countMatchesInTab(tab, payload, patternInfo) {
        return new Promise((resolve) => {
            chrome.tabs.sendMessage(tab.id, { type: "COUNT_MATCHES", payload }, (response) => {
                const baseResult = {
                    type: "tab",
                    tabId: tab.id,
                    windowId: tab.windowId,
                    title: tab.title || tab.url || "Tab",
                    url: tab.url,
                    favIconUrl: tab.favIconUrl,
                    totalMatches: 0,
                    perTerm: payload.searchTerms.map(term => ({ term, count: 0 })),
                    patternInfo: patternInfo || null
                };

                if (chrome.runtime.lastError) {
                    const errorMessage = chrome.runtime.lastError.message;
                    if (!errorMessage.includes("Receiving end does not exist")) {
                        console.warn(`Workspace COUNT_MATCHES error in tab ${tab.id}:`, errorMessage);
                    }
                    baseResult.error = errorMessage;
                    resolve(baseResult);
                    return;
                }

                if (response && response.success) {
                    baseResult.totalMatches = response.total || 0;
                    baseResult.perTerm = Array.isArray(response.perTerm) ? response.perTerm : baseResult.perTerm;
                } else if (response && response.error) {
                    baseResult.error = response.error;
                }

                resolve(baseResult);
            });
        });
    }

    function scanHistoryForMatches(query, tabResults = []) {
        return new Promise((resolve) => {
            if (!chrome.history || typeof chrome.history.search !== "function") {
                console.warn("History API unavailable; skipping history scan.");
                resolve([]);
                return;
            }

            chrome.history.search({
                text: "",
                maxResults: WORKSPACE_HISTORY_LIMIT * 4,
                startTime: Date.now() - WORKSPACE_HISTORY_LOOKBACK_MS
            }, (entries) => {
                if (chrome.runtime.lastError) {
                    console.error("History search failed:", chrome.runtime.lastError.message);
                    resolve([]);
                    return;
                }

                const tabUrls = new Set((tabResults || []).map(result => result.url));
                const seen = new Set();
                const filtered = [];

                (entries || [])
                    .sort((a, b) => (b.lastVisitTime || 0) - (a.lastVisitTime || 0))
                    .some(entry => {
                        if (!entry.url || seen.has(entry.url)) return false;
                        if (!isUrlEligibleForWorkspace(entry.url)) return false;
                        if (tabUrls.has(entry.url)) return false;

                        seen.add(entry.url);
                        filtered.push(entry);
                        return filtered.length >= WORKSPACE_HISTORY_LIMIT;
                    });

                if (filtered.length === 0) {
                    resolve([]);
                    return;
                }

                Promise.all(filtered.map(entry => countHistoryEntry(entry, query))).then(resolve);
            });
        });
    }

    function countHistoryEntry(entry, query) {
        return fetch(entry.url, { redirect: "follow", credentials: "omit" })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                const contentType = response.headers.get("content-type") || "";
                if (!contentType.includes("text")) {
                    throw new Error("Content not searchable (non-text response).");
                }
                return response.text();
            })
            .then(html => {
                let textContent = "";
                try {
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(html, "text/html");
                    textContent = doc.body?.innerText || doc.documentElement?.innerText || "";
                } catch (parseError) {
                    console.warn("Failed to parse history entry:", entry.url, parseError);
                }

                const counts = window.advancedFindSearchUtils.countMatchesInText(
                    textContent,
                    query.terms,
                    query.options,
                    query.options.excludeTerm,
                    window.advancedFindConfig?.config?.behavior?.excludeTermContextWords ?? 3
                );

                return {
                    type: "history",
                    title: entry.title || entry.url,
                    url: entry.url,
                    lastVisitTime: entry.lastVisitTime,
                    totalMatches: counts.total,
                    perTerm: counts.perTerm,
                    patternInfo: query.patternInfo || null
                };
            })
            .catch(error => ({
                type: "history",
                title: entry.title || entry.url,
                url: entry.url,
                lastVisitTime: entry.lastVisitTime,
                totalMatches: 0,
                perTerm: query.terms.map(term => ({ term, count: 0 })),
                patternInfo: query.patternInfo || null,
                error: error.message || String(error)
            }));
    }

    function focusWorkspaceTab(result) {
        if (!result || typeof result.tabId !== "number") return;
        const activateTab = () => {
            chrome.tabs.update(result.tabId, { active: true }, () => void chrome.runtime.lastError);
        };
        if (typeof result.windowId === "number") {
            chrome.windows.update(result.windowId, { focused: true }, () => {
                if (chrome.runtime.lastError) {
                    console.warn("Failed to focus window:", chrome.runtime.lastError.message);
                }
                activateTab();
            });
        } else {
            activateTab();
        }
    }

    function highlightWorkspaceTab(result) {
        if (!result || typeof result.tabId !== "number") return;
        if (!workspaceState.lastQuery) {
        updateWorkspaceStatus("Run a workspace scan before highlighting.", "error");
            return;
        }

        focusWorkspaceTab(result);

        const highlightOptions = {
            caseSensitive: workspaceState.lastQuery.options.caseSensitive,
            wholeWords: workspaceState.lastQuery.options.wholeWords,
            ignoreDiacritics: workspaceState.lastQuery.options.ignoreDiacritics,
            excludeTerm: workspaceState.lastQuery.options.excludeTerm,
            useRegex: workspaceState.lastQuery.options.useRegex,
            isProximity: false
        };

        chrome.tabs.sendMessage(result.tabId, {
            type: "SEARCH_TEXT",
            payload: {
                searchTerms: workspaceState.lastQuery.terms,
                options: highlightOptions
            }
        }, (response) => {
            if (chrome.runtime.lastError) {
                const message = chrome.runtime.lastError.message;
                if (!message.includes("Receiving end does not exist")) {
                    console.error("Failed to highlight workspace tab:", message);
                    updateWorkspaceStatus("Could not highlight tab (content script not available).", "error");
                }
                return;
            }
            if (response && response.success) {
                updateWorkspaceStatus(`Highlighted ${response.count || 0} matches in the selected tab.`, "success");
            } else {
                updateWorkspaceStatus("Highlight request failed in the selected tab.", "error");
            }
        });
    }

    function openHistoryResult(result) {
        if (!result?.url) return;
        chrome.tabs.create({ url: result.url }, (tab) => {
            if (chrome.runtime.lastError) {
                updateWorkspaceStatus("Unable to open history entry.", "error");
                console.error("Failed to open history result:", chrome.runtime.lastError.message);
            } else {
                updateWorkspaceStatus("Opened history entry in a new tab.", "success");
            }
        });
    }

    // --- Mode Switching ---
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
