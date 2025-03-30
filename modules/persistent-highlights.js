(() => {
    // Key prefix for storing data for specific URLs
    const STORAGE_KEY_PREFIX = "advFind_persist_";

    /**
     * Generates a storage key based on the current page URL.
     * Tries to normalize the URL slightly.
     * @returns {string|null} Storage key or null if URL is invalid.
     */
    function getStorageKey() {
         try {
            // Use location.origin + location.pathname for more specificity than just href
            // Exclude hash and search params to handle slightly different URLs for the same base content
             const url = window.location.origin + window.location.pathname;
             if (!url || url === "about:blank") return null;
             // Basic sanitization (replace non-alphanumeric with underscore) - might need improvement
             const sanitizedUrl = url.replace(/[^a-zA-Z0-9]/g, '_');
             return `${STORAGE_KEY_PREFIX}${sanitizedUrl}`.substring(0, 100); // Limit key length
         } catch (e) {
             console.error("Error creating storage key:", e);
             return null;
         }
    }

    /**
     * Saves the current search state to chrome.storage.local for the current URL.
     * @param {string[]} terms - The search terms used.
     * @param {object} options - The search options used.
     */
    function saveState(terms, options) {
        if (!window.advancedFindConfig.config.settings.persistentHighlightsEnabled) {
            // If persistence is disabled, ensure any old state is cleared
             clearState();
            return;
        }

        const key = getStorageKey();
        if (!key || !terms || terms.length === 0 || !options) {
            console.warn("Persistent Highlights: Invalid data or key, not saving state.", { key, terms, options });
            return;
        }

        const state = {
            terms: terms,
            options: options,
            timestamp: Date.now() // Add timestamp for potential future use (e.g., expiration)
        };

        // Use chrome.storage.local for page-specific data
        chrome.storage.local.set({ [key]: state }, () => {
            if (chrome.runtime.lastError) {
                console.error("Persistent Highlights: Error saving state:", chrome.runtime.lastError.message);
            } else {
                console.log("Persistent Highlights: State saved for key:", key);
            }
        });
    }

    /**
     * Restores the search state from chrome.storage.local for the current URL.
     * @param {function(string[], object)} callback - Called with the restored terms and options.
     */
    function restoreState(callback) {
         if (!window.advancedFindConfig.config.settings.persistentHighlightsEnabled) {
             console.log("Persistent Highlights: Disabled, not restoring state.");
             if (callback) callback(null, null);
             return;
         }

        const key = getStorageKey();
        if (!key) {
             if (callback) callback(null, null);
            return;
        }

        chrome.storage.local.get([key], (result) => {
            if (chrome.runtime.lastError) {
                console.error("Persistent Highlights: Error restoring state:", chrome.runtime.lastError.message);
                if (callback) callback(null, null);
            } else if (result && result[key]) {
                const state = result[key];
                console.log("Persistent Highlights: State restored for key:", key);
                // Basic validation
                if (state.terms && state.options) {
                    if (callback) callback(state.terms, state.options);
                } else {
                     console.warn("Persistent Highlights: Restored state is invalid.", state);
                     if (callback) callback(null, null);
                }
            } else {
                console.log("Persistent Highlights: No state found for key:", key);
                 if (callback) callback(null, null);
            }
        });
    }

    /**
     * Clears the saved search state for the current URL from chrome.storage.local.
     */
    function clearState() {
        const key = getStorageKey();
        if (!key) return;

        chrome.storage.local.remove(key, () => {
            if (chrome.runtime.lastError) {
                console.error("Persistent Highlights: Error clearing state:", chrome.runtime.lastError.message);
            } else {
                console.log("Persistent Highlights: State cleared for key:", key);
            }
        });
    }

    // Expose functions globally within the content script context
    window.advancedFindPersistence = {
        saveState,
        restoreState,
        clearState
    };

    console.log("Advanced Find: Persistence module loaded.");

})();