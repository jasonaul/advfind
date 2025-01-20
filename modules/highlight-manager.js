(() => {
    if (!window.advancedFindConfig || !window.advancedFindConfig.config) {
        console.error('Config not loaded');
        return;
    }

    const config = window.advancedFindConfig.config;





        class HighlightManager {
            constructor() {
                this.highlightSpans = [];
                this.matchCount = 0;
                this.currentHighlightIndex = -1;
                this.processedNodes = new Set(); // Initialize the Set
                this.debug = true;
            }

            updateHighlightColor(color) {
                const style = document.querySelector('#afe-highlight-style');
                if (style) {
                    style.textContent = `
                        .${config.highlight.highlightClass} {
                            background-color: ${color} !important;
                            color: black !important;
                            padding: 0.1em !important;
                            border-radius: 0.2em !important;
                            box-shadow: 0 0 0 1px ${color} !important;
                        }
                        .${config.highlight.currentHighlightClass} {
                            background-color: lightblue !important;
                            color: black !important;
                            box-shadow: 0 0 0 1px lightblue !important;
                        }
                    `;
                }
            }
            highlightAndNavigateMatches(searchTerm, options, direction) {
                console.log("🔍 Starting search for:", searchTerm);
                this.removeHighlights();
            
                try {
                    let count = 0;
                    let matches = 0;
                    let nodesWithMatches = [];
            
                    // Create the search regex
                    const regex = window.advancedFindSearchUtils.createSearchRegex(
                        searchTerm, 
                        options.caseSensitive, 
                        options.wholeWords, 
                        options.useRegex
                    );
            
                    // Traverse text nodes in the document
                    let allNodesWalker = document.createTreeWalker(
                        document.documentElement,
                        NodeFilter.SHOW_TEXT,
                        {
                            acceptNode: (node) => {
                                if (this.shouldAcceptNode(node)) {
                                    count++;
                                    return NodeFilter.FILTER_ACCEPT;
                                }
                                return NodeFilter.FILTER_SKIP;
                            }
                        }
                    );
            
                    let node;
                    while ((node = allNodesWalker.nextNode())) {
                        const text = node.textContent.trim();
                        console.log(`Processing node: "${text.slice(0, 30)}..."`);
            
                        if (regex.test(text)) {
                            nodesWithMatches.push({
                                content: text,
                                path: this.getNodePath(node),
                                visible: this.isNodeVisible(node)
                            });
            
                            this.processTextNode(node, regex);
                            matches++;
                        }
                    }
            
                    console.log(`📊 Search Analysis:
                        Search term: "${searchTerm}"
                        Total nodes scanned: ${count}
                        Potential matches found: ${nodesWithMatches.length}
                    `);
            
                    if (nodesWithMatches.length > 0) {
                        console.log('🔍 Nodes containing matches:', nodesWithMatches);
                    }
            
                    console.log(`✅ Total nodes processed: ${count}`);
                    console.log(`🎯 Total matches highlighted: ${this.matchCount}`);
                    console.log(`🖍 Highlight spans created: ${this.highlightSpans.length}`);
            
                    if (direction !== "none" && this.matchCount > 0) {
                        this.navigateMatches(direction);
                    }
            
                    return this.matchCount;
                } catch (error) {
                    console.error("❌ Error during highlighting:", error);
                    return 0;
                }
            }
            
            isNodeVisible(node) {
                let element = node.parentElement;
                while (element) {
                    const style = window.getComputedStyle(element);
                    if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) {
                        return false;
                    }
                    element = element.parentElement;
                }
                return true;
            }
            
            shouldAcceptNode(node) {
                if (!node || !node.textContent.trim()) {
                    return false; // Reject empty or null nodes
                }
            
                const parent = node.parentElement;
                if (!parent) return false;
            
                // Skip already highlighted nodes
                if (parent.classList.contains(config.highlight.highlightClass) ||
                    parent.classList.contains(config.highlight.currentHighlightClass)) {
                    return false;
                }
            
                // Reduce strict visibility checks
                const style = window.getComputedStyle(parent);
                if (style.display === 'none' || parseFloat(style.opacity) === 0) {
                    console.warn("⚠️ Loosening visibility rejection:", node.textContent.slice(0, 30));
                    return true; // Instead of rejecting, allow more matches
                }
            
                return true;
            }
            
            getNodeRejectionReason(node) {
                if (!node) return "Node is null";
                if (!node.textContent.trim()) return "Empty text";
                if (!node.parentElement) return "No parent element";
            
                const parent = node.parentElement;
                if (parent.classList.contains(config.highlight.highlightClass) ||
                    parent.classList.contains(config.highlight.currentHighlightClass)) {
                    return "Already highlighted";
                }
            
                if (!this.isNodeVisible(node)) return "Node is not visible";
            
                return "Node accepted";
            }
            
            getNodePath(node) {
                const path = [];
                let current = node.parentElement;
                while (current && current !== document.documentElement) {
                    let identifier = current.tagName.toLowerCase();
                    if (current.id) identifier += `#${current.id}`;
                    path.unshift(identifier);
                    current = current.parentElement;
                }
                return path.join(' > ');
            }
            
            processTextNode(node, regex) {
                if (!node || !node.textContent || !node.parentNode) return;
            
                const text = node.textContent;
                let match;
                let lastIndex = 0;
                let matches = 0;
                const fragment = document.createDocumentFragment();
            
                regex.lastIndex = 0;
            
                while ((match = regex.exec(text)) !== null) {
                    if (match.index > lastIndex) {
                        fragment.appendChild(
                            document.createTextNode(text.slice(lastIndex, match.index))
                        );
                    }
            
                    const highlightSpan = document.createElement('span');
                    highlightSpan.textContent = match[0];
                    highlightSpan.classList.add(config.highlight.highlightClass);
                    this.highlightSpans.push(highlightSpan);
                    fragment.appendChild(highlightSpan);
            
                    lastIndex = regex.lastIndex;
                    matches++;
                }
            
                if (lastIndex < text.length) {
                    fragment.appendChild(
                        document.createTextNode(text.slice(lastIndex))
                    );
                }
            
                if (matches > 0) {
                    console.log(`🖍 Highlighting ${matches} matches in node: "${text.slice(0, 30)}..."`);
            
                    // Delay execution to ensure the DOM update sticks
                    setTimeout(() => {
                        node.parentNode.replaceChild(fragment, node);
                        this.matchCount += matches;
                        console.log("✅ Highlight successfully applied.");
                    }, 500);
                } else {
                    console.warn(`⚠️ Match found but highlight failed for: "${text.slice(0, 30)}..."`);
                }
            }
            
        
        
        

        navigateMatches(direction) {
            if (this.matchCount === 0 || !this.highlightSpans.length) return;

            try {
                // Remove current highlight if it exists
                const previousHighlight = document.querySelector(
                    `.${config.highlight.currentHighlightClass}`
                );
                if (previousHighlight) {
                    previousHighlight.classList.remove(config.highlight.currentHighlightClass);
                }

                // Update current index based on direction
                switch (direction) {
                    case "next":
                        this.currentHighlightIndex = 
                            this.currentHighlightIndex === -1 ? 0 : 
                            (this.currentHighlightIndex + 1) % this.matchCount;
                        break;
                    case "previous":
                        this.currentHighlightIndex = 
                            this.currentHighlightIndex === -1 ? this.matchCount - 1 : 
                            (this.currentHighlightIndex - 1 + this.matchCount) % this.matchCount;
                        break;
                }

                // Apply current highlight class and scroll into view
                const currentMatchSpan = this.highlightSpans[this.currentHighlightIndex];
                if (currentMatchSpan) {
                    currentMatchSpan.classList.add(config.highlight.currentHighlightClass);
                    currentMatchSpan.scrollIntoView({
                        behavior: "smooth",
                        block: "center",
                        inline: "nearest"
                    });
                }
            } catch (error) {
                console.error('Error during navigation:', error);
            }
        }

        removeHighlights() {
            try {
                const highlights = document.querySelectorAll(
                    `.${config.highlight.highlightClass}, 
                     .${config.highlight.currentHighlightClass}`
                );
                
                highlights.forEach(highlight => {
                    const parent = highlight.parentNode;
                    if (parent) {
                        parent.replaceChild(
                            document.createTextNode(highlight.textContent || ''),
                            highlight
                        );
                        parent.normalize();
                    }
                });
                
                // Reset all state
                this.highlightSpans = [];
                this.matchCount = 0;
                this.currentHighlightIndex = -1;
                this.processedNodes.clear();
                
                console.log("Removed all highlights and reset state");
            } catch (error) {
                console.error('Error removing highlights:', error);
            }
        }
    }

    window.advancedFindHighlightManager = HighlightManager;
})();