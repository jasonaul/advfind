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
        }

        highlightAndNavigateMatches(searchTerm, options, direction) {
            console.log("Starting highlight and navigation process", { searchTerm, options });
            
            // Clear existing highlights
            this.removeHighlights();
            
            try {
                const regex = window.advancedFindSearchUtils.createSearchRegex(
                    searchTerm, 
                    options.caseSensitive, 
                    options.wholeWords, 
                    options.useRegex
                );
                
                const walker = window.advancedFindDomUtils.createTextWalker();
                this.matchCount = 0;
                let nodeCount = 0;
                
                console.log("Starting DOM traversal");
                let node;
                
                while ((node = walker.nextNode())) {
                    nodeCount++;
                    if (!node || !node.textContent) continue;
                    
                    const matches = this.highlightMatchesInNode(node, regex);
                    if (matches > 0) {
                        console.log(`Found ${matches} matches in node:`, {
                            text: node.textContent,
                            parentTag: node.parentNode?.tagName || 'NO_PARENT',
                            nodeType: node.nodeType
                        });
                    }
                    this.matchCount += matches;
                }

                console.log(`Traversed ${nodeCount} text nodes, found ${this.matchCount} total matches`);
                
                if (direction !== "none" && this.matchCount > 0) {
                    this.navigateMatches(direction);
                }
                
                return this.matchCount;
            } catch (error) {
                console.error("Error during highlighting:", error);
                return 0;
            }
        }

        highlightMatchesInNode(node, regex) {
            if (!node || !node.textContent || !node.parentNode) {
                return 0;
            }

            const text = node.textContent;
            let match;
            let lastIndex = 0;
            let matches = 0;
            const fragment = document.createDocumentFragment();
            
            try {
                regex.lastIndex = 0;
                
                while ((match = regex.exec(text)) !== null) {
                    // Add text before the match
                    if (match.index > lastIndex) {
                        fragment.appendChild(
                            document.createTextNode(text.slice(lastIndex, match.index))
                        );
                    }
                    
                    // Create highlight span for the match
                    const highlightSpan = document.createElement('span');
                    highlightSpan.textContent = match[0];
                    highlightSpan.classList.add(config.highlight.highlightClass);
                    this.highlightSpans.push(highlightSpan);
                    fragment.appendChild(highlightSpan);
                    
                    lastIndex = regex.lastIndex;
                    matches++;
                }
                
                // Add any remaining text
                if (lastIndex < text.length) {
                    fragment.appendChild(
                        document.createTextNode(text.slice(lastIndex))
                    );
                }
                
                // Only replace if we found matches
                if (matches > 0) {
                    node.parentNode.replaceChild(fragment, node);
                }
                
                return matches;
            } catch (error) {
                console.error('Error highlighting matches in node:', error);
                return 0;
            }
        }

        navigateMatches(direction) {
            if (this.matchCount === 0) return;

            try {
                switch (direction) {
                    case "next":
                        this.currentHighlightIndex = this.currentHighlightIndex === -1 ? 
                            0 : (this.currentHighlightIndex + 1) % this.matchCount;
                        break;
                    case "previous":
                        this.currentHighlightIndex = this.currentHighlightIndex === -1 ? 
                            this.matchCount - 1 : 
                            (this.currentHighlightIndex - 1 + this.matchCount) % this.matchCount;
                        break;
                }

                const previousHighlight = document.querySelector(
                    `.${config.highlight.currentHighlightClass}`
                );
                if (previousHighlight) {
                    previousHighlight.classList.remove(config.highlight.currentHighlightClass);
                }

                const currentMatchSpan = this.highlightSpans[this.currentHighlightIndex];
                if (currentMatchSpan) {
                    currentMatchSpan.classList.add(config.highlight.currentHighlightClass);
                    currentMatchSpan.scrollIntoView({ behavior: "smooth", block: "center" });
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
                    try {
                        const parent = highlight.parentNode;
                        if (parent) {
                            parent.replaceChild(
                                document.createTextNode(highlight.textContent || ''),
                                highlight
                            );
                            parent.normalize();
                        }
                    } catch (error) {
                        console.error('Error removing highlight:', error);
                    }
                });
                
                this.highlightSpans = [];
                this.matchCount = 0;
                this.currentHighlightIndex = -1;
                
                console.log("Removed existing highlights");
            } catch (error) {
                console.error('Error removing highlights:', error);
            }
        }
    }

    window.advancedFindHighlightManager = HighlightManager;
})();