(() => {
    const config = window.advancedFindConfig.config;

    function createTextWalker() {
        // First, ensure we're starting from a valid root
        const root = document.body || document.documentElement;
        if (!root) {
            console.error('No valid root element found');
            return null;
        }

        return document.createTreeWalker(
            root,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: function(node) {
                    try {
                        // Basic node validation
                        if (!node) return NodeFilter.FILTER_REJECT;

                        // Get the actual parent element (not text node)
                        let parent = node.parentElement;
                        if (!parent) return NodeFilter.FILTER_REJECT;

                        // Skip invisible elements
                        if (isHiddenElement(parent)) {
                            return NodeFilter.FILTER_REJECT;
                        }

                        // Skip special tags
                        if (shouldSkipNode(parent)) {
                            return NodeFilter.FILTER_REJECT;
                        }

                        // Skip highlight spans
                        if (isHighlightNode(parent)) {
                            return NodeFilter.FILTER_REJECT;
                        }

                        // Accept all other text nodes, even if empty
                        return NodeFilter.FILTER_ACCEPT;
                    } catch (e) {
                        console.error('Error in acceptNode:', e);
                        return NodeFilter.FILTER_REJECT;
                    }
                }
            }
        );
    }

    function walkAllTextNodes(callback) {
        const walker = createTextWalker();
        if (!walker) return;

        const textNodes = [];
        let node;
        
        console.log('Starting text node walk...');
        while (node = walker.nextNode()) {
            try {
                if (callback) {
                    callback(node);
                }
                textNodes.push({
                    text: node.textContent,
                    parentTag: node.parentElement?.tagName || 'NO_PARENT'
                });
            } catch (e) {
                console.error('Error processing node:', e);
            }
        }
        console.log('Found text nodes:', textNodes);
        return textNodes;
    }

    function isHighlightNode(element) {
        if (!element || !element.classList) return false;
        return element.classList.contains(config.highlight.highlightClass) ||
               element.classList.contains(config.highlight.currentHighlightClass);
    }

    function isHiddenElement(element) {
        try {
            while (element && element !== document.documentElement) {
                const style = window.getComputedStyle(element);
                if (style.display === 'none' || 
                    style.visibility === 'hidden' || 
                    style.opacity === '0' ||
                    style.width === '0px' ||
                    style.height === '0px') {
                    return true;
                }
                element = element.parentElement;
            }
        } catch (e) {
            console.error('Error checking element visibility:', e);
        }
        return false;
    }

    function shouldSkipNode(element) {
        const skipTags = new Set([
            'SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'SELECT', 'TEXTAREA',
            'HEAD', 'META', 'AUDIO', 'VIDEO', 'CANVAS', 'SVG', 'EMBED',
            'OBJECT', 'PARAM'
        ]);

        try {
            return skipTags.has(element.tagName);
        } catch (e) {
            console.error('Error checking skip status:', e);
            return true;
        }
    }

    function injectHighlightStyle() {
        if (!document.head) {
            window.addEventListener('DOMContentLoaded', () => injectHighlightStyle());
            return;
        }

        if (document.querySelector('#afe-highlight-style')) return;

        const styleElement = document.createElement("style");
        styleElement.id = 'afe-highlight-style';
        styleElement.textContent = `
            .${config.highlight.highlightClass} {
                background-color: yellow !important;
                color: black !important;
                padding: 0.1em !important;
                border-radius: 0.2em !important;
                box-shadow: 0 0 0 1px yellow !important;
            }
            .${config.highlight.currentHighlightClass} {
                background-color: lightblue !important;
                color: black !important;
                box-shadow: 0 0 0 1px lightblue !important;
            }
        `;
        document.head.appendChild(styleElement);
        console.log("Advanced Find Extension: Highlight style injected");
    }

    // Debug function to help identify all text nodes
    function debugTextNodes() {
        console.log('Debugging text nodes...');
        walkAllTextNodes((node) => {
            console.log('Text Node:', {
                content: node.textContent,
                parentTag: node.parentElement?.tagName,
                parentClasses: node.parentElement?.className
            });
        });
    }

    window.advancedFindDomUtils = {
        createTextWalker,
        shouldSkipNode,
        injectHighlightStyle,
        walkAllTextNodes,
        debugTextNodes
    };
})();