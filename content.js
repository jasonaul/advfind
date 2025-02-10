// ===== Inject Enhanced Highlight Styles into Main Document and Shadow DOM =====
(function injectEnhancedHighlightStyles() {
    const styleId = "afe-highlight-style";
  
    function createStyleElement() {
      const style = document.createElement("style");
      style.id = styleId;
      // Increase specificity by targeting mark elements within html body
      style.textContent = `
        html body mark.afe-highlight {
          background-color: yellow !important;
          color: black !important;
          padding: 0.1em !important;
          border-radius: 0.2em !important;
          box-shadow: 0 0 0 1px yellow !important;
        }
        html body mark.afe-highlight-current {
          background-color: lightblue !important;
          color: black !important;
          box-shadow: 0 0 0 1px lightblue !important;
        }
        html body mark.afe-highlight-proximity {
          background-color: lightgreen !important;
          color: black !important;
        }
        html body mark.afe-highlight-secondary {
          background-color: red !important;
          color: white !important;
        }
      `;
      return style;
    }
  
    // Inject the style into the main document head if not already present.
    if (!document.getElementById(styleId)) {
      const style = createStyleElement();
      if (document.head) {
        document.head.appendChild(style);
      } else {
        document.addEventListener("DOMContentLoaded", () => {
          document.head.appendChild(style);
        });
      }
    }
  
    // Function to inject a clone of the style element into a given shadow root.
    function injectStyleIntoShadow(root) {
      if (!root) return;
      if (!root.querySelector(`#${styleId}`)) {
        const styleClone = createStyleElement();
        root.appendChild(styleClone);
      }
      // Recursively check for nested shadow roots.
      Array.from(root.children).forEach(child => {
        if (child.shadowRoot) {
          injectStyleIntoShadow(child.shadowRoot);
        }
      });
    }
  
    // Find all elements with a shadowRoot and inject the style there.
    document.querySelectorAll("*").forEach(el => {
      if (el.shadowRoot) {
        injectStyleIntoShadow(el.shadowRoot);
      }
    });
  })();
  
  

(() => {
    let isContentScriptInjected = false;
    let highlightManager = null;
    // window.advancedFindDomUtils.injectHighlightStyle();


    function injectSidebarStyles() {
        const style = document.createElement('style');
        style.id = 'advanced-find-sidebar-styles';
        style.textContent = `
          body.has-advanced-find-sidebar {
            margin-right: var(--sidebar-width, 350px) !important;
            transition: margin-right 0.3s ease;
            width: calc(100% - var(--sidebar-width, 350px)) !important;
            position: relative;
          }
          #advanced-find-sidebar-container {
            position: fixed;
            top: 0;
            right: 0;
            width: var(--sidebar-width, 350px);
            height: 100vh;
            background: white;
            z-index: 2147483647;
            border-left: 1px solid #ccc;
            box-shadow: -2px 0 5px rgba(0, 0, 0, 0.1);
            transition: transform 0.3s ease;
            display: flex;
            flex-direction: column;
          }
          #advanced-find-sidebar {
            width: 100%;
            height: 100%;
            border: none;
            background: white;
            flex: 1;
          }
        `;
        document.head.appendChild(style);
    }

    function initResizableSidebar() {
        const sidebarContainer = document.getElementById('advanced-find-sidebar-container');
        if (!sidebarContainer) return;
        let isResizing = false;
        let startX, startWidth;

        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'sidebar-resize-handle';
        resizeHandle.style.cssText = `
            position: absolute;
            left: 0;
            top: 0;
            bottom: 0;
            width: 3px;
            cursor: ew-resize;
            background: transparent;
            transition: background-color 0.2s ease;
        `;
        sidebarContainer.appendChild(resizeHandle);

        resizeHandle.addEventListener('mouseenter', () => {
            if (!isResizing) {
                resizeHandle.style.backgroundColor = 'rgba(0, 0, 0, 0.1)';
            }
        });
        resizeHandle.addEventListener('mouseleave', () => {
            if (!isResizing) {
                resizeHandle.style.backgroundColor = 'transparent';
            }
        });

        resizeHandle.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            isResizing = true;
            startX = e.clientX;
            startWidth = sidebarContainer.offsetWidth;
            resizeHandle.style.backgroundColor = 'rgba(0, 0, 0, 0.2)';
            document.body.style.cursor = 'ew-resize';
            document.body.style.userSelect = 'none';
            const iframe = document.getElementById('advanced-find-sidebar');
            if (iframe) {
                iframe.style.pointerEvents = 'none';
            }

            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            e.preventDefault();
            e.stopPropagation();
        });

        function handleMouseMove(e) {
            if (!isResizing) return;
            const diff = e.clientX - startX;
            let newWidth = Math.min(800, Math.max(250, startWidth - diff));
            requestAnimationFrame(() => {
                sidebarContainer.style.width = `${newWidth}px`;
                document.documentElement.style.setProperty('--sidebar-width', `${newWidth}px`);
            });
            e.preventDefault();
        }

        function handleMouseUp(e) {
            if (!isResizing) return;
            isResizing = false;
            resizeHandle.style.backgroundColor = 'transparent';
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            const iframe = document.getElementById('advanced-find-sidebar');
            if (iframe) {
                iframe.style.pointerEvents = '';
            }
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);

            const finalWidth = sidebarContainer.offsetWidth;
            chrome.storage.sync.set({ sidebarWidth: finalWidth });
            e.preventDefault();
            e.stopPropagation();
        }

        chrome.storage.sync.get(['sidebarWidth'], (result) => {
            if (result.sidebarWidth) {
                const width = result.sidebarWidth;
                sidebarContainer.style.width = `${width}px`;
                document.documentElement.style.setProperty('--sidebar-width', `${width}px`);
            }
        });

        return function cleanup() {
            resizeHandle.remove();
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }


    function initializeContentScript() {
        if (isContentScriptInjected) return;

        try {
            // Access the highlightManager directly from the window object.
            highlightManager = window.highlightManager;
            setupMessageListeners();

            // Debounced reapply function (simplified)
            let lastSearchText = null;
            let lastOptions = null;

            const debouncedReapply = debounce(() => {
                if (lastSearchText && lastOptions && !lastOptions.isProximity) {
                    console.warn("🔄 Reapplying the highlights due to DOM changes...");
                    highlightManager.highlight(lastSearchText, lastOptions);
                }
            }, 300);
            
            const observer = new MutationObserver((mutations) => {
                if (!document.querySelector(".afe-highlight, .afe-highlight-proximity, .afe-highlight-secondary")) {
                    debouncedReapply();
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
            

            isContentScriptInjected = true;
            console.log("Advanced Find Extension: Content script initialized successfully");
            chrome.runtime.sendMessage({ type: "CONTENT_SCRIPT_READY" });
        } catch (error) {
            console.error('Error initializing content script:', error);
        }
    }

    function setupMessageListeners() {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (!highlightManager) {
                sendResponse({ success: false, error: "Highlight manager not initialized" });
                return true; // keep channel open for async responses.
            }

            switch (request.type) {
                case "CHECK_INJECTION":
                    sendResponse({ injected: isContentScriptInjected });
                    break;

                case "SEARCH_TEXT":
                    // Store the search term and options for later re-application
                    lastSearchText = request.payload.searchTerm;
                    lastOptions = request.payload.options;

                    highlightManager.highlight(lastSearchText, lastOptions);
                    sendResponse({success: true}); // Acknowledge receipt
                    break;

                    case "SEARCH_PROXIMITY":
                        // Pass the callback to return the match count.
                        highlightManager.highlightProximity(
                            request.payload.searchTerm,
                            request.payload.searchTerm2,
                            request.payload.proximityValue,
                            request.payload.options,
                            (count) => {
                                sendResponse({ success: true, count });
                            }
                        );
                        return true; // Keep message channel open
                    
                    

                case "CLEAR_HIGHLIGHTS":
                    highlightManager.clearHighlights();
                    removeTickMarks(); // Remove tick marks
                    sendResponse({ success: true });
                    break;


                case "TOGGLE_SIDEBAR": {
                    let sidebarContainer = document.getElementById('advanced-find-sidebar-container');
                    if (sidebarContainer) {
                        sidebarContainer.classList.toggle('hidden');
                        document.body.classList.toggle('sidebar-hidden');
                        sendResponse({ success: true });
                    } else {
                        injectSidebarStyles();
                        document.body.classList.add('has-advanced-find-sidebar');
                        sidebarContainer = document.createElement('div');
                        sidebarContainer.id = 'advanced-find-sidebar-container';
                        const iframe = document.createElement('iframe');
                        iframe.id = 'advanced-find-sidebar';
                        iframe.src = chrome.runtime.getURL('popup.html');
                        iframe.src = chrome.runtime.getURL('popup.html');
                        sidebarContainer.appendChild(iframe);
                        document.body.appendChild(sidebarContainer);
                        setTimeout(() => {
                            initResizableSidebar();
                            sendResponse({ success: true });
                        }, 100);
                        return true; // Keep the message channel open for the setTimeout.
                    }
                    break;
                }

                case "NAVIGATE":
                    // Calls the navigate() method (defined in highlight-manager.js below)
                    highlightManager.navigate(request.payload.direction);
                    sendResponse({ success: true });
                    break;
        

                case "CLEANUP_SIDEBAR":
                    cleanupSidebar();
                    sendResponse({ success: true });
                    break;

                case "RENDER_TICK_MARKS":
                    renderTickMarks();
                    sendResponse({success: true}); // Acknowledge
                    break;
            }

            return true; // Keep the message channel open for async responses.
        });
    }


    function cleanupSidebar() {
        const sidebarContainer = document.getElementById('advanced-find-sidebar-container');
        if (sidebarContainer) {
            sidebarContainer.remove();
        }
        const styles = document.getElementById('advanced-find-sidebar-styles');
        if (styles) {
            styles.remove();
        }
        document.body.classList.remove('has-advanced-find-sidebar', 'sidebar-hidden');
    }

    // --- Tick Mark Rendering ---
    function renderTickMarks() {
        let container = document.getElementById("tick-mark-container");
        if (container) container.remove();

        container = document.createElement("div");
        container.id = "tick-mark-container";
        container.style.position = "fixed";
        container.style.top = "0";
        container.style.right = "0";
        container.style.width = "10px";
        container.style.height = "100%";
        container.style.zIndex = "2147483646"; // just below our sidebar
        document.body.appendChild(container);

        const docHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
        const highlights = document.querySelectorAll(".afe-highlight, .afe-highlight-proximity");  //Also include proximity
        highlights.forEach(span => {
            const rect = span.getBoundingClientRect();
            const topPosition = ((rect.top + window.scrollY) / docHeight) * 100;
            const tick = document.createElement("div");
            tick.className = "tick-mark";
            tick.style.position = "absolute";
            tick.style.left = "0";
            tick.style.width = "10px";
            tick.style.height = "5px";
            tick.style.backgroundColor = window.advancedFindConfig.tickMarkColor; // Use configured color
            tick.style.top = `calc(${topPosition}% - 2.5px)`;
            tick.style.cursor = "pointer";
            tick.addEventListener("click", () => {
                span.scrollIntoView({ behavior: "smooth", block: "center" });
            });
            container.appendChild(tick);
        });
    }

    function removeTickMarks() {
        const container = document.getElementById("tick-mark-container");
        if (container) container.remove();
    }

    // Simple debounce function
    function debounce(func, wait) {
        let timeout;
        return function(...args) {
            const context = this;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), wait);
        };
    }


    initializeContentScript(); // Initialize immediately

})();