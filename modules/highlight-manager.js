// /modules/highlight-manager.js
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
            this.processedNodes = new Set();
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

                const regex = window.advancedFindSearchUtils.createSearchRegex(
                    searchTerm, 
                    options.caseSensitive, 
                    options.wholeWords, 
                    options.useRegex
                );

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

        // NEW: Implement proximity search highlighting
        highlightProximityMatches(searchTerm, searchTerm2, proximityValue, caseSensitive) {
            console.log("🔍 Starting proximity search for:", searchTerm, "and", searchTerm2);
            this.removeHighlights();

            const flags = caseSensitive ? "g" : "gi";
            const escapeRegex = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const term1 = escapeRegex(searchTerm);
            const term2 = escapeRegex(searchTerm2);
            // Build a regex that matches term1 then up to N words then term2 OR vice versa.
            const pattern = `\\b(${term1})(?:\\W+\\w+){0,${proximityValue}}\\W+(${term2})\\b|\\b(${term2})(?:\\W+\\w+){0,${proximityValue}}\\W+(${term1})\\b`;
            let regex;
            try {
                regex = new RegExp(pattern, flags);
            } catch (e) {
                console.error("Invalid regex for proximity search:", e);
                return 0;
            }

            let count = 0;
            let matches = 0;
            let nodesWithMatches = [];
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
            console.log(`Proximity search: found ${matches} matches in ${count} nodes.`);
            return this.matchCount;
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
            if (!node || !node.textContent.trim()) return false;
            const parent = node.parentElement;
            if (!parent) return false;
            if (parent.classList.contains(config.highlight.highlightClass) ||
                parent.classList.contains(config.highlight.currentHighlightClass)) {
                return false;
            }
            const style = window.getComputedStyle(parent);
            if (style.display === 'none' || parseFloat(style.opacity) === 0) {
                console.warn("⚠️ Loosening visibility rejection:", node.textContent.slice(0, 30));
                return true;
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

        // UPDATED: Use requestAnimationFrame and store original text when replacing text nodes.
        processTextNode(node, regex) {
            if (!node || !node.textContent || !node.parentNode) return;

            const originalText = node.textContent;
            let lastIndex = 0;
            let matches = 0;
            const fragment = document.createDocumentFragment();
            regex.lastIndex = 0;
            let match;
            while ((match = regex.exec(originalText)) !== null) {
                if (match.index > lastIndex) {
                    fragment.appendChild(
                        document.createTextNode(originalText.slice(lastIndex, match.index))
                    );
                }
                const highlightSpan = document.createElement('span');
                highlightSpan.textContent = match[0];
                highlightSpan.classList.add(config.highlight.highlightClass);
                // Store original text (if needed for future revert)
                highlightSpan.dataset.originalText = originalText;
                highlightSpan.dataset.matchIndex = matches;
                this.highlightSpans.push(highlightSpan);
                fragment.appendChild(highlightSpan);
                lastIndex = regex.lastIndex;
                matches++;
            }
            if (lastIndex < originalText.length) {
                fragment.appendChild(
                    document.createTextNode(originalText.slice(lastIndex))
                );
            }
            if (matches > 0) {
                requestAnimationFrame(() => {
                    if (node.parentNode) {
                        node.parentNode.replaceChild(fragment, node);
                        this.matchCount += matches;
                        console.log("✅ Highlight successfully applied.");
                    }
                });
            } else {
                console.warn(`⚠️ Match found but highlight failed for: "${originalText.slice(0, 30)}..."`);
            }
        }

        navigateMatches(direction) {
            if (this.matchCount === 0 || !this.highlightSpans.length) return;
            try {
                const previousHighlight = document.querySelector(
                    `.${config.highlight.currentHighlightClass}`
                );
                if (previousHighlight) {
                    previousHighlight.classList.remove(config.highlight.currentHighlightClass);
                }
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

    // For tick mark rendering later, assign the instance globally.
    window.advancedFindHighlightManagerInstance = new HighlightManager();
})();
