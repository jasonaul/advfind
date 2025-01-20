(() => {
    const config = window.advancedFindConfig.config;

    function* iterateAllTextNodes(root) {
        // Skip if root is null
        if (!root) return;

        // Handle text nodes
        if (root.nodeType === Node.TEXT_NODE) {
            yield root;
            return;
        }

        // Skip if this is a node we should ignore
        if (root.nodeType === Node.ELEMENT_NODE && shouldSkipNode(root)) {
            return;
        }

        try {
            // Handle shadow DOM if present
            if (root.shadowRoot) {
                yield* iterateAllTextNodes(root.shadowRoot);
            }

            // Handle slot elements
            if (root.tagName === 'SLOT') {
                const assigned = root.assignedNodes();
                for (const node of assigned) {
                    yield* iterateAllTextNodes(node);
                }
            }

            // Handle iframes that we can access
            if (root.tagName === 'IFRAME') {
                try {
                    const iframeDoc = root.contentDocument || root.contentWindow?.document;
                    if (iframeDoc) {
                        yield* iterateAllTextNodes(iframeDoc.body);
                    }
                } catch (e) {
                    // Skip iframes we can't access due to same-origin policy
                    console.debug('Could not access iframe contents:', e);
                }
            }

            // Recursively handle child nodes
            for (const child of root.childNodes) {
                yield* iterateAllTextNodes(child);
            }
        } catch (e) {
            console.error('Error traversing DOM:', e);
        }
    }

    function createTextWalker() {
        const iterator = iterateAllTextNodes(document.documentElement);
        return {
            nextNode() {
                const {value, done} = iterator.next();
                if (done) return null;
                
                // Additional validation for the node
                if (value && value.nodeType === Node.TEXT_NODE && value.textContent.trim()) {
                    return value;
                }
                // If this node isn't valid, get the next one
                return this.nextNode();
            }
        };
    }

    function shouldSkipNode(element) {
        const skipTags = new Set([
            'SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'SELECT', 'TEXTAREA',
            'HEAD', 'META', 'TITLE', 'LINK', 'BASE', 'AUDIO', 'VIDEO'
        ]);
    
        if (!element || !element.tagName) return true;
        if (skipTags.has(element.tagName)) return true;
    
        // Ensure parent elements are not hidden
        let parent = element;
        while (parent) {
            const style = window.getComputedStyle(parent);
            if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) {
                return true;
            }
            parent = parent.parentElement;
        }
    
        return false;
    }
    

    function injectHighlightStyle() {
        if (!document.head) {
            window.addEventListener('DOMContentLoaded', () => injectHighlightStyle());
            return;
        }

        // Remove any existing highlight styles
        const existingStyle = document.querySelector('#afe-highlight-style');
        if (existingStyle) {
            existingStyle.remove();
        }

        const styleElement = document.createElement("style");
        styleElement.id = 'afe-highlight-style';
        styleElement.textContent = `
            /* Base highlight styles */
            .${config.highlight.highlightClass} {
                background-color: yellow !important;
                color: black !important;
                padding: 0.1em !important;
                border-radius: 0.2em !important;
                box-shadow: 0 0 0 1px yellow !important;
                text-shadow: none !important;
            }
            
            .${config.highlight.currentHighlightClass} {
                background-color: lightblue !important;
                color: black !important;
                box-shadow: 0 0 0 1px lightblue !important;
                text-shadow: none !important;
            }

            /* Ensure our highlights work in shadow DOM */
            :host .${config.highlight.highlightClass},
            ::slotted(.${config.highlight.highlightClass}) {
                background-color: yellow !important;
                color: black !important;
            }

            :host .${config.highlight.currentHighlightClass},
            ::slotted(.${config.highlight.currentHighlightClass}) {
                background-color: lightblue !important;
                color: black !important;
            }
        `;

        document.head.appendChild(styleElement);

        // Also inject styles into any shadow roots
        function injectIntoShadows(root) {
            if (!root) return;
            
            if (root.shadowRoot) {
                const shadowStyle = styleElement.cloneNode(true);
                if (!root.shadowRoot.querySelector('#afe-highlight-style')) {
                    root.shadowRoot.appendChild(shadowStyle);
                }
            }

            // Recursively check child elements
            for (const child of root.children) {
                injectIntoShadows(child);
            }
        }

        injectIntoShadows(document.documentElement);
        console.log("Advanced Find Extension: Highlight style injected");
    }

    function debugTextNodes() {
        console.log('Debugging text nodes...');
        const nodes = [];
        const walker = createTextWalker();
        let node;
        while ((node = walker.nextNode())) {
            nodes.push({
                text: node.textContent,
                parentTag: node.parentElement?.tagName || 'NO_PARENT',
                path: getNodePath(node),
                inShadowDOM: isInShadowDOM(node),
                isVisible: isNodeVisible(node)
            });
        }
        console.log('Found text nodes:', nodes);
        return nodes;
    }

    function isInShadowDOM(node) {
        let current = node;
        while (current) {
            if (current.getRootNode() instanceof ShadowRoot) return true;
            current = current.parentNode;
        }
        return false;
    }

    function isNodeVisible(node) {
        try {
            const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
            if (!element) return true;

            const style = window.getComputedStyle(element);
            return !(style.display === 'none' || 
                    style.visibility === 'hidden' || 
                    parseFloat(style.opacity) === 0);
        } catch (e) {
            return true;
        }
    }

    function getNodePath(node) {
        const path = [];
        let current = node.parentElement;
        while (current && current !== document.documentElement) {
            let identifier = current.tagName.toLowerCase();
            if (current.id) identifier += `#${current.id}`;
            if (current.shadowRoot) identifier += '::shadow';
            path.unshift(identifier);
            current = current.parentElement;
        }
        return path.join(' > ');
    }

    window.advancedFindDomUtils = {
        createTextWalker,
        shouldSkipNode,
        injectHighlightStyle,
        debugTextNodes,
        getNodePath
    };
})();