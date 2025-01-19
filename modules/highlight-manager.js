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
        highlightProximityMatches(term1, term2, maxDistance, caseSensitive) {
            this.removeHighlights();
            this.matchCount = 0;
            const walker = window.advancedFindDomUtils.createTextWalker();
            
            let node;
            while ((node = walker.nextNode())) {
                if (!node || !node.textContent) continue;
                
                const text = node.textContent;
                const flags = caseSensitive ? 'g' : 'gi';
                const regex1 = new RegExp(`\\b${term1}\\b`, flags);
                const regex2 = new RegExp(`\\b${term2}\\b`, flags);
                
                let positions = [];
                let match;
                
                // Find all matches for both terms
                while ((match = regex1.exec(text)) !== null) {
                    positions.push({
                        index: match.index,
                        term: 1,
                        text: match[0],
                        used: false // Mark if this position has been used in a match
                    });
                }
                
                while ((match = regex2.exec(text)) !== null) {
                    positions.push({
                        index: match.index,
                        term: 2,
                        text: match[0],
                        used: false
                    });
                }
                
                // Sort positions by index
                positions.sort((a, b) => a.index - b.index);
                
                // Find valid pairs and their ranges
                const validRanges = [];
                
                // For each term1, find the closest term2 within range
                for (let i = 0; i < positions.length; i++) {
                    if (positions[i].used) continue;
                    
                    let bestMatch = null;
                    let bestDistance = Infinity;
                    let bestJ = -1;
                    
                    // Look for the closest matching term in the other direction
                    for (let j = 0; j < positions.length; j++) {
                        if (i !== j && !positions[j].used && positions[i].term !== positions[j].term) {
                            const startPos = Math.min(positions[i].index, positions[j].index);
                            const endPos = Math.max(positions[i].index, positions[j].index);
                            const textBetween = text.substring(startPos, endPos);
                            const wordCount = textBetween.trim().split(/\s+/).length - 1;
                            
                            if (wordCount <= maxDistance && wordCount < bestDistance) {
                                bestDistance = wordCount;
                                bestMatch = {
                                    start: startPos,
                                    end: endPos + positions[j].text.length
                                };
                                bestJ = j;
                            }
                        }
                    }
                    
                    if (bestMatch) {
                        validRanges.push(bestMatch);
                        positions[i].used = true;
                        positions[bestJ].used = true;
                    }
                }
                
                if (validRanges.length > 0) {
                    // Create highlighted fragment
                    const fragment = document.createDocumentFragment();
                    let lastIndex = 0;
                    
                    // Sort ranges by start position
                    validRanges.sort((a, b) => a.start - b.start);
                    
                    validRanges.forEach(range => {
                        // Add unhighlighted text before this range
                        if (range.start > lastIndex) {
                            fragment.appendChild(
                                document.createTextNode(text.substring(lastIndex, range.start))
                            );
                        }
                        
                        // Add highlighted range
                        const highlightSpan = document.createElement('span');
                        highlightSpan.textContent = text.substring(range.start, range.end);
                        highlightSpan.classList.add(config.highlight.highlightClass);
                        this.highlightSpans.push(highlightSpan);
                        fragment.appendChild(highlightSpan);
                        
                        lastIndex = range.end;
                        this.matchCount++;
                    });
                    
                    // Add any remaining unhighlighted text
                    if (lastIndex < text.length) {
                        fragment.appendChild(
                            document.createTextNode(text.substring(lastIndex))
                        );
                    }
                    
                    // Replace original node with new fragment
                    node.parentNode.replaceChild(fragment, node);
                }
            }
            
            return this.matchCount;
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