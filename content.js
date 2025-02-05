// /content.js

function injectSidebarStyles() {
    const style = document.createElement('style');
    style.id = 'advanced-find-sidebar-styles';
    style.textContent = `
        body.has-advanced-find-sidebar {
            margin-right: 350px !important;
            transition: margin-right 0.3s ease;
            width: calc(100% - 350px) !important;
            position: relative;
        }
        #advanced-find-sidebar-container {
            position: fixed;
            top: 0;
            right: 0;
            width: 350px;
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

(() => {
    let isContentScriptInjected = false;
    let highlightManager = null;

    function initializeContentScript() {
        if (isContentScriptInjected) return;
        
        try {
            window.advancedFindDomUtils.injectHighlightStyle();
            // Use the globally instantiated HighlightManager from highlight-manager.js
            highlightManager = window.advancedFindHighlightManagerInstance;
            setupMessageListeners();

            const debouncedReapply = window.advancedFindDomUtils.debounce(() => {
                if (highlightManager && window.currentSearchTerm) {
                    console.warn("🔄 Reapplying the highlights due to DOM changes...");
                    setTimeout(() => {
                        highlightManager.highlightAndNavigateMatches(window.currentSearchTerm, window.currentOptions, "none");
                    }, 300);
                }
            }, 300);

            const observer = new MutationObserver(debouncedReapply);
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
                return true;
            }
    
            switch (request.type) {
                case "CHECK_INJECTION":
                    sendResponse({ injected: isContentScriptInjected });
                    break;
    
                case "SEARCH_TEXT":
                    handleSearchText(request, sendResponse);
                    break;
    
                case "NAVIGATE":
                    highlightManager.navigateMatches(request.payload.direction);
                    sendResponse({ success: true });
                    break;
    
                case "CLEAR_HIGHLIGHTS":
                    highlightManager.removeHighlights();
                    // Also remove tick marks, if any.
                    removeTickMarks();
                    sendResponse({ success: true });
                    break;
    
                case "UPDATE_HIGHLIGHT_COLOR":
                    if (highlightManager) {
                        highlightManager.updateHighlightColor(request.payload.color);
                    }
                    sendResponse({ success: true });
                    break;
    
                // Removed REPLACE_HIGHLIGHTS case.
    
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
                        sidebarContainer.appendChild(iframe);
                        document.body.appendChild(sidebarContainer);
                        setTimeout(() => {
                            initResizableSidebar();
                            sendResponse({ success: true });
                        }, 100);
                        return true;
                    }
                    break;
                }
    
                case "CLEANUP_SIDEBAR":
                    cleanupSidebar();
                    sendResponse({ success: true });
                    break;
    
                // NEW: Listen for tick mark rendering request
                case "RENDER_TICK_MARKS":
                    renderTickMarks();
                    break;
            }
            return true;
        });
    }

    function handleSearchText(request, sendResponse) {
        const { searchTerm, searchTerm2, proximityValue, options } = request.payload;
    
        if (!searchTerm || searchTerm.trim() === "") {
            console.log("Empty search term received.");
            highlightManager.removeHighlights();
            sendResponse({ success: false, count: 0, error: "Search term is empty" });
            return;
        }
    
        try {
            let matchCount;
            if (options.proximitySearch && searchTerm2) {
                matchCount = highlightManager.highlightProximityMatches(
                    searchTerm,
                    searchTerm2,
                    proximityValue,
                    options.caseSensitive
                );
            } else {
                matchCount = highlightManager.highlightAndNavigateMatches(searchTerm, options, "none");
            }
            
            console.log(`Highlighted ${matchCount} instances`);
            sendResponse({ success: true, count: matchCount });
        } catch (error) {
            console.error("Error during text highlighting:", error);
            sendResponse({ success: false, error: "Error during text highlighting" });
        }
    }
    
    function checkModules() {
        return window.advancedFindConfig && 
               window.advancedFindDomUtils && 
               window.advancedFindSearchUtils && 
               window.advancedFindHighlightManagerInstance;
    }

    if (checkModules()) {
        initializeContentScript();
    } else {
        const checkInterval = setInterval(() => {
            if (checkModules()) {
                clearInterval(checkInterval);
                initializeContentScript();
            }
        }, 50);
        setTimeout(() => {
            clearInterval(checkInterval);
            if (!isContentScriptInjected) {
                console.error('Failed to load required modules after timeout');
            }
        }, 5000);
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

    // --- NEW: Tick Mark Rendering ---
    function renderTickMarks() {
        // Remove any existing tick marks container
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
        // Select all highlighted spans (using the standard highlight class)
        const highlights = document.querySelectorAll("." + window.advancedFindConfig.config.highlight.highlightClass);
        highlights.forEach(span => {
            const rect = span.getBoundingClientRect();
            // Compute relative position (in percentage)
            const topPosition = ((rect.top + window.scrollY) / docHeight) * 100;
            const tick = document.createElement("div");
            tick.className = "tick-mark";
            tick.style.position = "absolute";
            tick.style.left = "0";
            tick.style.width = "10px";
            tick.style.height = "5px";
            tick.style.backgroundColor = "red";
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

    window.advancedFindDomUtils.debugTextNodes();
})();
