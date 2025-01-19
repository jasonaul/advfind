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

    // Add resize handle with more precise width
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

    // Hover effects for resize handle
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

    // Mouse down on resize handle
    resizeHandle.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return; // Only handle left mouse button
        
        isResizing = true;
        startX = e.clientX; // Use clientX instead of pageX for more consistent measurements
        startWidth = sidebarContainer.offsetWidth;
        
        resizeHandle.style.backgroundColor = 'rgba(0, 0, 0, 0.2)';
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';
        
        // Prevent iframe from capturing mouse events during resize
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

        // Calculate the difference (reversed from before)
        const diff = e.clientX - startX;
        let newWidth = Math.min(800, Math.max(250, startWidth - diff));

        requestAnimationFrame(() => {
            // Update sidebar width
            sidebarContainer.style.width = `${newWidth}px`;
            
            // Update CSS variable for body margin
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

        // Re-enable iframe events
        const iframe = document.getElementById('advanced-find-sidebar');
        if (iframe) {
            iframe.style.pointerEvents = '';
        }

        // Remove event listeners
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);

        // Store the final width
        const finalWidth = sidebarContainer.offsetWidth;
        chrome.storage.sync.set({ sidebarWidth: finalWidth });

        e.preventDefault();
        e.stopPropagation();
    }

    // Initialize width from storage
    chrome.storage.sync.get(['sidebarWidth'], (result) => {
        if (result.sidebarWidth) {
            const width = result.sidebarWidth;
            sidebarContainer.style.width = `${width}px`;
            document.documentElement.style.setProperty('--sidebar-width', `${width}px`);
        }
    });

    // Add cleanup function to prevent memory leaks
    return function cleanup() {
        resizeHandle.remove();
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
    };
}


(() => {
    let isContentScriptInjected = false;
    let highlightManager = null;

    // Initialize content script
    function initializeContentScript() {
        if (isContentScriptInjected) return;
        
        try {
            window.advancedFindDomUtils.injectHighlightStyle();
            highlightManager = new window.advancedFindHighlightManager();
            setupMessageListeners();
            
            isContentScriptInjected = true;
            console.log("Advanced Find Extension: Content script initialized successfully");
            chrome.runtime.sendMessage({ type: "CONTENT_SCRIPT_READY" });
        } catch (error) {
            console.error('Error initializing content script:', error);
        }
    }

    // Message handling setup
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
                    sendResponse({ success: true });
                    break;
    
                case "UPDATE_HIGHLIGHT_COLOR":
                    if (highlightManager) {
                        highlightManager.updateHighlightColor(request.payload.color);
                    }
                    sendResponse({ success: true });
                    break;
    
                    case "TOGGLE_SIDEBAR": {
                        let sidebarContainer = document.getElementById('advanced-find-sidebar-container');
                        if (sidebarContainer) {
                            sidebarContainer.classList.toggle('hidden');
                            document.body.classList.toggle('sidebar-hidden');
                            sendResponse({ success: true });
                        } else {
                            // Inject styles first
                            injectSidebarStyles();
                            
                            // Add class to body to trigger margin adjustment
                            document.body.classList.add('has-advanced-find-sidebar');
                            
                            // Create container
                            sidebarContainer = document.createElement('div');
                            sidebarContainer.id = 'advanced-find-sidebar-container';
                            
                            // Create iframe
                            const iframe = document.createElement('iframe');
                            iframe.id = 'advanced-find-sidebar';
                            iframe.src = chrome.runtime.getURL('popup.html');
                            
                            // Add iframe to container
                            sidebarContainer.appendChild(iframe);
                            document.body.appendChild(sidebarContainer);
                            
                            // Initialize resizable functionality after a short delay to ensure DOM is ready
                            setTimeout(() => {
                                initResizableSidebar();
                                sendResponse({ success: true });
                            }, 100);
                            
                            return true; // Will respond asynchronously
                        }
                        break;
                    }
    
                case "CLEANUP_SIDEBAR":
                    cleanupSidebar();
                    sendResponse({ success: true });
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

    

    // Check if required modules are loaded
    function checkModules() {
        return window.advancedFindConfig && 
               window.advancedFindDomUtils && 
               window.advancedFindSearchUtils && 
               window.advancedFindHighlightManager;
    }

    // Initialize if modules are ready
    if (checkModules()) {
        initializeContentScript();
    } else {
        // Wait for modules to load
        const checkInterval = setInterval(() => {
            if (checkModules()) {
                clearInterval(checkInterval);
                initializeContentScript();
            }
        }, 50);

        // Clear interval after 5 seconds if modules haven't loaded
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
})();

window.advancedFindDomUtils.debugTextNodes();
