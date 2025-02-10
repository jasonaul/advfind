(() => {
    if (window.HighlightManager) return;
  
    class HighlightManager {
        constructor() {
            this.markInstance = new Mark(document.body);
            this.textNodeCache = [];
        }
    
        initialize() {
            this.buildTextNodeCache();
        }

        buildTextNodeCache() {
            // Reset the cache and global offset.
            this.textNodeCache = [];
            let position = 0;
        
            // Recursive function to traverse all nodes, including shadow roots.
            function traverse(node) {
                if (node.nodeType === Node.TEXT_NODE) {
                    let text = node.textContent;
                    if (text.trim()) {
                        this.textNodeCache.push({
                            node: node,
                            text: text,
                            start: position,
                            end: position + text.length
                        });
                        position += text.length;
                    }
                } else if (node.nodeType === Node.ELEMENT_NODE) {
                    // Skip elements that are known not to contain visible text.
                    const tag = node.tagName;
                    if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'OBJECT', 'EMBED'].includes(tag)) {
                        return;
                    }
                    // If the element has a shadow root, traverse it.
                    if (node.shadowRoot) {
                        traverse.call(this, node.shadowRoot);
                    }
                    // Traverse each child node.
                    for (let child of node.childNodes) {
                        traverse.call(this, child);
                    }
                } else if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
                    for (let child of node.childNodes) {
                        traverse.call(this, child);
                    }
                }
            }
            traverse.call(this, document.documentElement);
        }
        

        highlight(searchText, options = {}) {
            if (!this.markInstance) {
                console.error("HighlightManager not initialized.");
                return;
            }
    
            this.markInstance.unmark({
                done: () => {
                    if (options.proximitySearch && options.searchTerm2) {
                        this.highlightProximity(searchText, options.searchTerm2, options.proximityValue, options);
                    } else {
                        try {
                            const regex = window.advancedFindSearchUtils.createSearchRegex(
                                searchText,
                                options.caseSensitive,
                                options.wholeWords,
                                options.useRegex
                            );
// Determine whether we are on a complex page like Reddit
let disableAcrossElements = window.location.href.indexOf("reddit.com") !== -1;

this.markInstance.markRegExp(regex, {
    className: window.advancedFindConfig.config.highlight.highlightClass,
    acrossElements: true,
    ...options,
    done: (count) => {
        console.log(`Highlighted ${count} occurrences of "${searchText}"`);
    }
});


                        } catch (error) {
                            console.error("Error highlighting with regex:", error);
                        }
                    }
                }
            });
        }

        highlightProximity(term1, term2, maxDistance, options, callback) {
            // First, remove any existing highlights.
            this.markInstance.unmark({
                done: () => {
                    // Helper to escape regex special characters.
                    function escapeRegex(str) {
                        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    }
        
                    // If wholeWords is desired, add word-boundary markers.
                    let escapedTerm1 = options.wholeWords ? "\\b" + escapeRegex(term1) + "\\b" : escapeRegex(term1);
                    let escapedTerm2 = options.wholeWords ? "\\b" + escapeRegex(term2) + "\\b" : escapeRegex(term2);
        
                    // Build a pattern that allows up to maxDistance words between the two terms.
                    // The pattern (?:\W+\w+){0,maxDistance}\W* means: 
                    // "0 to maxDistance occurrences of (some non-word characters then a word)"
                    let intervening = `(?:\\W+\\w+){0,${maxDistance}}\\W*`;
        
                    // Build two possible orders: term1 followed by term2, or term2 followed by term1.
                    let pattern1 = escapedTerm1 + intervening + escapedTerm2;
                    let pattern2 = escapedTerm2 + intervening + escapedTerm1;
        
                    // Combine the two with alternation.
                    let combinedPattern = "(" + pattern1 + ")|(" + pattern2 + ")";
                    
                    // Set regex flags: global and optionally case-insensitive.
                    let flags = options.caseSensitive ? "g" : "gi";
        
                    try {
                        let combinedRegex = new RegExp(combinedPattern, flags);
                        console.log("Using proximity regex:", combinedRegex);
                        
                        // Use mark.js to highlight all matches of the combined regex.
                        this.markInstance.markRegExp(combinedRegex, {
                            className: window.advancedFindConfig.config.highlight.proximityHighlightClass,
                            acrossElements: true,
                            separateWordSearch: false,
                            done: (count) => {
                                console.log(`Found ${count} proximity matches`);
                                if (callback) callback(count);
                            }
                        });
                    } catch (e) {
                        console.error("Error creating proximity regex:", e);
                        if (callback) callback(0);
                    }
                }
            });
        }
        
        
        

        findAllMatches(regex) {
            let matches = [];
            for (let nodeInfo of this.textNodeCache) {
                let match;
                while ((match = regex.exec(nodeInfo.text)) !== null) {
                    matches.push({
                        start: nodeInfo.start + match.index,
                        end: nodeInfo.start + match.index + match[0].length,
                        text: match[0]
                    });
                }
            }
            return matches;
        }

        countWordsBetween(start, end) {
            // Get the text between these positions from our cache
            let text = '';
            for (let nodeInfo of this.textNodeCache) {
                if (nodeInfo.end < start) continue;
                if (nodeInfo.start > end) break;
                
                let nodeText = nodeInfo.text;
                if (nodeInfo.start < start) {
                    nodeText = nodeText.slice(start - nodeInfo.start);
                }
                if (nodeInfo.end > end) {
                    nodeText = nodeText.slice(0, end - nodeInfo.start);
                }
                text += nodeText + ' ';
            }
            
            // Count words using a simple split on whitespace
            return text.trim().split(/\s+/).length - 1;
        }

        mergeOverlappingRanges(ranges) {
            if (ranges.length <= 1) return ranges;
            
            ranges.sort((a, b) => a.start - b.start);
            
            let merged = [ranges[0]];
            
            for (let i = 1; i < ranges.length; i++) {
                let current = ranges[i];
                let previous = merged[merged.length - 1];
                
                if (current.start <= previous.start + previous.length) {
                    previous.length = Math.max(
                        previous.length,
                        current.start - previous.start + current.length
                    );
                } else {
                    merged.push(current);
                }
            }
            
            return merged;
        }

        clearHighlights() {
            if (!this.markInstance) {
                console.error("HighlightManager not initialized.");
                return;
            }
            this.markInstance.unmark();
        }

        navigate(direction) {
            const highlights = document.querySelectorAll(
                `.${window.advancedFindConfig.config.highlight.highlightClass}, ` +
                `.${window.advancedFindConfig.config.highlight.proximityHighlightClass}`
            );
            if (!highlights.length) return;
    
            let currentIndex = -1;
            highlights.forEach((el, i) => {
                if (el.classList.contains(window.advancedFindConfig.config.highlight.currentHighlightClass)) {
                    currentIndex = i;
                }
            });
    
            if (direction === "next") {
                currentIndex = (currentIndex + 1) % highlights.length;
            } else if (direction === "previous") {
                currentIndex = (currentIndex - 1 + highlights.length) % highlights.length;
            }
    
            highlights.forEach(el => 
                el.classList.remove(window.advancedFindConfig.config.highlight.currentHighlightClass)
            );
    
            const target = highlights[currentIndex];
            target.classList.add(window.advancedFindConfig.config.highlight.currentHighlightClass);
            target.scrollIntoView({ behavior: "smooth", block: "center" });
        }
    }
    
    window.HighlightManager = HighlightManager;
    window.highlightManager = new HighlightManager();
    window.highlightManager.initialize();
})();