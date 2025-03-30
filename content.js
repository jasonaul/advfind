// (function injectEnhancedHighlightStyles() { ... }) - Start of Style Injection IIFE
(function injectEnhancedHighlightStyles() {
    const styleId = "afe-highlight-style";

    // Function to create/update the style element with current config
    function createOrUpdateStyleElement() {
        let style = document.getElementById(styleId);
        if (!style) {
            style = document.createElement("style");
            style.id = styleId;
        }

        // Ensure config and its dependent structures are loaded
        if (!window.advancedFindConfig || !window.advancedFindConfig.config || !window.advancedFindConfig.config.highlight || !window.advancedFindConfig.config.settings) {
            console.error("Cannot generate styles: Config not fully loaded.");
            return null; // Return null if config isn't ready
        }

        const highlightConfig = window.advancedFindConfig.config.highlight;
        const settings = window.advancedFindConfig.config.settings;

        // Define default text color (assuming black is generally good contrast for light highlights)
        const defaultTextColor = 'black';

        // Use the primary highlight color from settings for the base style
        const baseBgColor = settings.defaultHighlightColor || '#ffff00'; // Fallback yellow
        const currentBgColor = highlightConfig.currentStyle?.backgroundColor || 'lightblue'; // Use optional chaining
        const proximityBgColor = highlightConfig.proximityStyle?.backgroundColor || 'lightgreen';

        let cssText = `
            /* Base style for all highlights */
            mark.${highlightConfig.baseClass} {
                padding: 0.1em 0.15em !important; /* Slightly more horizontal padding */
                border-radius: 0.25em !important; /* Slightly larger radius */
                text-shadow: none !important;
                background-color: ${baseBgColor} !important;
                color: ${defaultTextColor} !important;
                 /* Subtle outline matching background */
                box-shadow: 0 0 0 1px ${baseBgColor} !important;
                margin: 0 1px; /* Add tiny horizontal margin to prevent touching */
            }

            /* Current navigation highlight */
            mark.${highlightConfig.currentHighlightClass} {
                background-color: ${currentBgColor} !important;
                color: ${highlightConfig.currentStyle?.color || defaultTextColor} !important;
                /* More prominent outline/shadow */
                box-shadow: 0 0 0 2px ${currentBgColor}, 0 1px 3px rgba(0,0,0,0.2) !important;
                outline: 1px solid rgba(0,0,0,0.4) !important;
                /* Optional: Slightly raise the element */
                /* position: relative; z-index: 1; */
            }

             /* Proximity highlight */
            mark.${highlightConfig.proximityHighlightClass} {
                background-color: ${proximityBgColor} !important;
                color: ${highlightConfig.proximityStyle?.color || defaultTextColor} !important;
                box-shadow: 0 0 0 1px ${proximityBgColor} !important;
             }
        `;

        // Add styles for multi-term classes dynamically based on config settings
        // Use settings.multiHighlightColors as the source of truth
        const multiColors = settings.multiHighlightColors || [];
         highlightConfig.highlightClasses.forEach((className, index) => {
             // Skip index 0 (handled by baseClass)
             if (index === 0) return;

             // Get color from settings array, using default style color if setting unavailable
             const bgColor = multiColors[index - 1] || highlightConfig.styles[index]?.backgroundColor || '#CCCCCC'; // Fallback grey
             const textColor = highlightConfig.styles[index]?.color || defaultTextColor;

             cssText += `
                 mark.${className} {
                     background-color: ${bgColor} !important;
                     color: ${textColor} !important;
                      box-shadow: 0 0 0 1px ${bgColor} !important;
                 }
             `;
        });

        // Add styles for shadow DOM compatibility (simple version)
        // This assumes :host and ::slotted work, complex cases might need more specific selectors
         cssText += `
            :host mark.${highlightConfig.baseClass},
            ::slotted(mark.${highlightConfig.baseClass}) {
                background-color: ${baseBgColor} !important;
                color: ${defaultTextColor} !important;
                padding: 0.1em 0.15em !important;
                border-radius: 0.25em !important;
                box-shadow: 0 0 0 1px ${baseBgColor} !important;
                margin: 0 1px;
            }
            :host mark.${highlightConfig.currentHighlightClass},
            ::slotted(mark.${highlightConfig.currentHighlightClass}) {
                background-color: ${currentBgColor} !important;
                color: ${highlightConfig.currentStyle?.color || defaultTextColor} !important;
                box-shadow: 0 0 0 2px ${currentBgColor}, 0 1px 3px rgba(0,0,0,0.2) !important;
                outline: 1px solid rgba(0,0,0,0.4) !important;
            }
            /* Add :host / ::slotted rules for other classes if needed */
         `;

        style.textContent = cssText;
        return style;
    }
    // ... rest of the IIFE (injectIntoHead, injectIntoShadows, update function) remains largely the same ...

     // Inject into main document head
    function injectIntoHead(doc) {
        const head = doc.head || doc.querySelector('head');
         if (!head) {
             doc.addEventListener("DOMContentLoaded", () => injectIntoHead(doc), { once: true });
             return;
         }
        let style = createOrUpdateStyleElement();
        if (!style) return; // Don't proceed if config wasn't ready

        // Remove existing style first if present
        const existingStyle = doc.getElementById(styleId);
        if (existingStyle) {
            existingStyle.remove();
        }
        head.appendChild(style);
        
    }

    // Inject into Shadow DOMs
    function injectIntoShadows(rootNode) {
        rootNode.querySelectorAll('*').forEach(el => {
            if (el.shadowRoot) {
                 const existingShadowStyle = el.shadowRoot.getElementById(styleId);
                 if (existingShadowStyle) {
                     existingShadowStyle.remove(); // Remove old one first
                 }
                const styleClone = createOrUpdateStyleElement(); // Get updated style
                if(styleClone) { // Check if style was created successfully
                    el.shadowRoot.appendChild(styleClone);
                }
                // Recursively check within the shadow root
                injectIntoShadows(el.shadowRoot);
            }
        });
    }

    // Initial injection attempt
    injectIntoHead(document);
    injectIntoShadows(document.documentElement);

     // Expose a function to update styles if needed (e.g., after color change from settings)
     window.updateAdvancedFindStyles = () => {
         
         injectIntoHead(document);
         injectIntoShadows(document.documentElement);
         // Optional: Force re-rendering (often not necessary as CSS applies)
         // document.querySelectorAll('.afe-highlight').forEach(el => { el.style.display = 'none'; el.offsetHeight; el.style.display = ''; });
     };

})();


// --- Main Content Script Logic ---
(() => {
    // Ensure this runs only once
    if (window.advancedFindContentScriptLoaded) {
        
        return;
    }
    window.advancedFindContentScriptLoaded = true;

    let isContentScriptInjected = false;
    let highlightManagerInstance = null; // Will hold the instance from highlight-manager.js

    // Function to initialize or retrieve the HighlightManager instance
    function getHighlightManager() {
        if (!highlightManagerInstance) {
            if (window.highlightManager) {
                highlightManagerInstance = window.highlightManager;
                
            } else {
                console.error("Content Script: HighlightManager instance not found! Highlighting will fail.");
                // This indicates a script loading order issue.
                return null;
            }
        }
        return highlightManagerInstance;
    }

    // Main initialization function
    function initializeContentScript() {
        // Double-check to prevent multiple initializations
        if (isContentScriptInjected) {
             
             return;
        }

        

        // Load settings from storage first to configure behavior
        chrome.storage.sync.get(
             [ // Load all settings that affect content script behavior or styles
                 'highlightColor',
                 // 'displayMode', // If sidebar logic was here
                 'ignoreDiacritics',
                 'searchHistoryEnabled', // Needed for config update
                 'persistentHighlightsEnabled',
                 'multiHighlightColors'
             ],
            (settings) => {
                 if (chrome.runtime.lastError) {
                     console.error("Error loading settings in content script:", chrome.runtime.lastError.message);
                     // Proceed with defaults if loading fails?
                 } else {
                     
                     // Update the global config object before doing anything else
                     window.advancedFindConfig?.updateConfigFromStorage(settings);
                     // Update injected CSS styles based on loaded settings
                     window.updateAdvancedFindStyles?.();
                 }

                 // Now, attempt to get the manager instance AFTER config is potentially updated
                 highlightManagerInstance = getHighlightManager();

                 if (highlightManagerInstance) {
                     setupMessageListeners(); // Setup listeners to respond to popup/background
                     isContentScriptInjected = true; // Mark as injected *before* potential async restore
                     

                     // Restore highlights if the setting is enabled
                     if (window.advancedFindConfig?.config?.settings?.persistentHighlightsEnabled) {
                         
                         window.advancedFindPersistence?.restoreState((terms, options) => {
                            if (terms && options && highlightManagerInstance) {
                                 
                                 // Get a fresh instance in case it was recreated
                                 const currentManager = getHighlightManager();
                                 if (!currentManager) {
                                     console.error("HighlightManager gone during restore callback!");
                                     return;
                                 }

                                 // Determine which highlight function to call
                                 if (options.isProximity && terms.length === 2 && options.proximityValue !== undefined) {
                                     currentManager.highlightProximity(terms[0], terms[1], options.proximityValue, options, (count) => {
                                          
                                          if (count > 0) renderTickMarksDebounced(); // Use debounced version
                                      });
                                 } else if (!options.isProximity && terms.length > 0) {
                                      currentManager.highlight(terms, options, (count) => {
                                          
                                          if (count > 0) renderTickMarksDebounced(); // Use debounced version
                                      });
                                 } else {
                                     console.warn("Invalid state data for persistence restore.", {terms, options});
                                 }
                            } else {
                                
                            }
                         });
                     } else {
                          
                     }

                     // Send ready message AFTER potential restore starts (restore is async)
                     // Background/popup can proceed, restore will finish when it finishes.
                     chrome.runtime.sendMessage({ type: "CONTENT_SCRIPT_READY" }, (response) => {
                         if (chrome.runtime.lastError) {
                              if (!chrome.runtime.lastError.message.includes("Receiving end does not exist")) {
                                 console.warn("Error sending CONTENT_SCRIPT_READY:", chrome.runtime.lastError.message);
                              }
                         } else {
                             
                         }
                     });

                 } else {
                     console.error("Advanced Find Extension: Failed to initialize HighlightManager. Script may not function.");
                     // Attempting to send ready message might fail, or popup check will fail.
                 }
            } // End callback for chrome.storage.sync.get
        ); // End chrome.storage.sync.get call

    } // End initializeContentScript

    function setupMessageListeners() {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            const manager = getHighlightManager(); // Get latest manager instance

            // Allow CHECK_INJECTION even if manager isn't ready
            if (request.type === "CHECK_INJECTION") {
                sendResponse({ injected: isContentScriptInjected });
                return false; // Synchronous response
            }

            // For all other messages, require the manager
            if (!manager) {
                console.error(`Cannot handle message type "${request.type}": HighlightManager not ready.`);
                sendResponse({ success: false, error: "HighlightManager not initialized" });
                return false; // Synchronous error response
            }

            // Log received messages

            // Flag to indicate if sendResponse will be async
            let isAsync = false;

            switch (request.type) {
                case "SEARCH_TEXT":
                    if (!request.payload || !request.payload.searchTerms || !Array.isArray(request.payload.searchTerms)) {
                         console.error("Invalid SEARCH_TEXT payload:", request.payload);
                         sendResponse({ success: false, error: "Invalid search terms payload." });
                         break; // Sync response
                    }
                     isAsync = true; // Mark as async
                    manager.highlight(request.payload.searchTerms, request.payload.options, (count) => {
                        sendResponse({ success: true, count: count });
                        // Don't render ticks here, popup does it after response
                    });
                    break;

                case "SEARCH_PROXIMITY":
                     if (!request.payload || !request.payload.searchTerm || !request.payload.searchTerm2 || request.payload.proximityValue === undefined) {
                         console.error("Invalid SEARCH_PROXIMITY payload:", request.payload);
                         sendResponse({ success: false, error: "Invalid proximity terms payload." });
                         break; // Sync response
                     }
                    isAsync = true; // Mark as async
                    manager.highlightProximity(
                        request.payload.searchTerm,
                        request.payload.searchTerm2,
                        request.payload.proximityValue,
                        request.payload.options,
                        (count) => {
                            sendResponse({ success: true, count: count });
                             // Don't render ticks here, popup does it after response
                        }
                    );
                    break;

                case "CLEAR_HIGHLIGHTS":
                    manager.clearHighlights();
                    removeTickMarks(); // Remove tick marks immediately on clear
                    sendResponse({ success: true });
                    break; // Sync response

                case "NAVIGATE":
                    if (!request.payload || (request.payload.direction !== 'next' && request.payload.direction !== 'previous')) {
                         console.error("Invalid NAVIGATE payload:", request.payload);
                         sendResponse({ success: false, error: "Invalid navigation direction." });
                         break; // Sync response
                     }
                    manager.navigate(request.payload.direction);
                    sendResponse({ success: true }); // Navigation is effectively synchronous
                    break;

                case "GET_HIGHLIGHTS_FOR_EXPORT":
                    try {
                        const highlightsData = manager.getHighlightsForExport();
                         sendResponse({
                             success: true,
                             highlights: highlightsData,
                             pageUrl: window.location.href,
                             pageTitle: document.title
                         });
                    } catch (error) {
                        console.error("Error gathering highlights for export:", error);
                        sendResponse({ success: false, error: "Failed to gather highlights: " + error.message });
                    }
                    break; // Sync response

                case "RENDER_TICK_MARKS":
                    renderTickMarksDebounced(); // Use debounced render
                    sendResponse({ success: true });
                    break; // Sync response

                 case "CLEAR_TICK_MARKS":
                     removeTickMarks();
                     sendResponse({ success: true });
                     break; // Sync response

                 case "UPDATE_SETTINGS":
                     
                     if (window.advancedFindConfig?.updateConfigFromStorage) {
                        window.advancedFindConfig.updateConfigFromStorage(request.payload);
                        window.updateAdvancedFindStyles?.(); // Update injected styles
                        // Optional: Decide if a re-highlight is needed based on changed settings
                        // e.g., if ignoreDiacritics changed, might need re-search.
                        // manager?.reapplyHighlights(); // Consider implications
                     } else {
                         console.error("Config update function not available.");
                     }
                     sendResponse({ success: true });
                     break; // Sync response


                // --- Sidebar related messages (Placeholder - Implement if sidebar feature is built) ---
                case "TOGGLE_SIDEBAR":
                     console.warn("TOGGLE_SIDEBAR handling not implemented in content.js.");
                     // Example: if sidebar was an iframe managed here:
                     // toggleSidebarIframe();
                    sendResponse({ success: true, message: "Sidebar toggle acknowledged (not implemented)." });
                    break;
                case "CLEANUP_SIDEBAR":
                     console.warn("CLEANUP_SIDEBAR handling not implemented in content.js.");
                    // cleanupSidebarIframe();
                    sendResponse({ success: true, message: "Sidebar cleanup acknowledged (not implemented)." });
                    break;


                default:
                    console.warn(`Unknown message type received: ${request.type}`);
                    sendResponse({ success: false, error: `Unknown message type: ${request.type}` });
                    break; // Sync response
            }

            // Return true ONLY if sendResponse is called asynchronously (within a callback)
            return isAsync;
        });
         

    } // End setupMessageListeners


    // --- Tick Mark Rendering ---
    let tickMarkContainer = null;
    const renderTickMarksDebounced = window.advancedFindDomUtils.debounce(renderTickMarks, 150); // Debounce rendering


    function renderTickMarks() {
        // Clear existing ticks first
        removeTickMarks();

        // Create container (only if it doesn't exist)
        tickMarkContainer = document.createElement("div");
        tickMarkContainer.id = "afe-tick-mark-container";
        // Apply styles via JS (could be moved to injected CSS, but simpler here for dynamic elements)
        Object.assign(tickMarkContainer.style, {
            position: 'fixed',
            top: '0',
            right: '0', // Position on the right
            width: '10px', // Width of the tick bar
            height: '100%',
            zIndex: '2147483645', // High z-index, but below potential modals/sidebars (2147483647)
            pointerEvents: 'none', // Allow clicks to pass through container
             // Optional: subtle background for the bar?
             // backgroundColor: 'rgba(0, 0, 0, 0.03)',
        });

        // Find a suitable parent to append to (usually body, but handle edge cases)
        const appendTarget = document.body || document.documentElement;
         try {
             appendTarget.appendChild(tickMarkContainer);
         } catch (e) {
             console.error("Failed to append tick mark container:", e);
             tickMarkContainer = null; // Reset if failed
             return;
         }

        // Get all types of highlights using the base class
        const highlights = document.querySelectorAll(`.${window.advancedFindConfig?.config?.highlight?.baseClass}`);
        if (!highlights || highlights.length === 0) {
            
            removeTickMarks(); // Clean up container if no highlights
            return;
        }

        const docHeight = Math.max(
            document.body.scrollHeight, document.documentElement.scrollHeight,
            document.body.offsetHeight, document.documentElement.offsetHeight,
            document.body.clientHeight, document.documentElement.clientHeight
        );

        if (docHeight <= 0) {
             console.warn("Could not determine document height for tick marks.");
             return;
         }

        const tickMarkColor = window.advancedFindConfig?.tickMarkColor || "rgba(200, 0, 0, 0.6)"; // Slightly less harsh red

        // Use a DocumentFragment for performance when adding many ticks
        const fragment = document.createDocumentFragment();

        highlights.forEach(span => {
             try {
                const rect = span.getBoundingClientRect();
                // Account for scroll position to get position relative to document
                const scrollY = window.pageYOffset || document.documentElement.scrollTop;
                const elementTopInDocument = rect.top + scrollY;
                // Calculate percentage position, ensuring it's within 0-100
                const topPercentage = Math.max(0, Math.min(100, (elementTopInDocument / docHeight) * 100));

                const tick = document.createElement("div");
                tick.className = "afe-tick-mark";
                 Object.assign(tick.style, {
                    position: 'absolute',
                    left: '0',
                    width: '100%', // Fill container width
                    height: '2px', // Thin ticks
                    backgroundColor: tickMarkColor,
                    top: `calc(${topPercentage}% - 1px)`, // Center the 2px tick vertically
                    pointerEvents: 'auto', // Make individual ticks interactive
                    cursor: 'pointer',
                    borderRadius: '1px' // Optional rounding
                 });
                 tick.setAttribute('role', 'button');
                 tick.setAttribute('aria-label', 'Scroll to highlight');
                 tick.title = 'Scroll to highlight'; // Tooltip

                tick.addEventListener("click", (e) => {
                    e.stopPropagation(); // Prevent potential container events
                    span.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });

                    // Temporarily emphasize the scrolled-to highlight
                    const currentClass = window.advancedFindConfig?.config?.highlight?.currentHighlightClass;
                    if (currentClass) {
                        const manager = getHighlightManager();
                        // Check if it's *already* the current nav target
                        const isCurrentNav = manager && manager.currentHighlights[manager.currentIndex] === span;
                        if (!isCurrentNav) {
                            span.classList.add(currentClass);
                            setTimeout(() => {
                                // Re-check if it became the current nav target in the meantime
                                const stillNotCurrentNav = manager && manager.currentHighlights[manager.currentIndex] !== span;
                                if (stillNotCurrentNav) {
                                    span.classList.remove(currentClass);
                                }
                             }, 1500); // Remove emphasis after 1.5 seconds unless it's the navigated element
                        }
                    }
                });
                fragment.appendChild(tick);
             } catch (e) {
                  console.warn("Error processing highlight element for tick mark:", span, e);
             }
        });

        tickMarkContainer.appendChild(fragment); // Append all ticks at once
        
    }

    function removeTickMarks() {
        if (tickMarkContainer) {
            tickMarkContainer.remove();
            tickMarkContainer = null; // Clear reference
            
        }
    }


    // --- Initialization Call ---
    // Use DOMContentLoaded to ensure the DOM is ready, especially the body/head
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeContentScript);
    } else {
        // DOM is already ready
        initializeContentScript();
    }

})(); // End Main Content Script IIFE