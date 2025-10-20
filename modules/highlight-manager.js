(() => {
    // Ensure Mark.js is loaded
    if (typeof Mark === 'undefined') {
        console.error("Mark.js not loaded!");
        return;
    }
    if (window.HighlightManager) return; // Prevent re-initialization

    class HighlightManager {
        constructor() {
            // Initialize Mark.js on document.body. Consider targeting a more specific container if possible?
            // Using document.documentElement allows searching in <head> too, if needed, but body is common.
            this.markInstance = new Mark(document.documentElement); // Target whole document
            this.currentHighlights = []; // Store references to current highlight elements
            this.currentIndex = -1;      // Index for navigation
            this.currentSearchOptions = null; // Store options for persistence/reapply
            this.currentSearchTerms = [];   // Store terms for persistence/reapply

             // Debounce MutationObserver callback
            this.debouncedReapplyHighlights = window.advancedFindDomUtils.debounce(this.reapplyHighlights.bind(this), 500); // Use debounce from dom-utils
            this.observer = new MutationObserver(this.handleDomChanges.bind(this));

            
        }

         /**
         * Starts observing the DOM for changes that might require reapplying highlights.
         */
        startObserver() {
             try {
                this.observer.observe(document.body, {
                    childList: true,
                    subtree: true,
                    characterData: true // Observe text changes too
                });
                
             } catch (e) {
                 console.error("HighlightManager: Failed to start MutationObserver.", e);
             }
        }

        /**
         * Stops observing the DOM.
         */
        stopObserver() {
            this.observer.disconnect();
            
        }

         /**
          * Handles DOM changes detected by the MutationObserver.
          * Schedules a debounced reapplication of highlights if necessary.
          * @param {MutationRecord[]} mutationsList - List of mutations.
          */
         handleDomChanges(mutationsList) {
            // Basic check: Did any mutation potentially remove our highlights or add relevant text?
            let potentiallyAffected = false;
            for (const mutation of mutationsList) {
                // If nodes were removed, check if any were highlights
                if (mutation.removedNodes.length > 0) {
                     for (const node of mutation.removedNodes) {
                         if (node.nodeType === Node.ELEMENT_NODE && node.matches && node.matches(`.${window.advancedFindConfig.config.highlight.baseClass}`)) {
                            potentiallyAffected = true;
                            break;
                         }
                         // Also check if a parent of a removed node was a highlight
                          if (node.nodeType === Node.TEXT_NODE && node.parentElement && node.parentElement.matches(`.${window.advancedFindConfig.config.highlight.baseClass}`)) {
                             potentiallyAffected = true;
                             break;
                         }
                     }
                }
                 // If nodes were added, or character data changed, it *might* contain new matches
                if (mutation.addedNodes.length > 0 || mutation.type === 'characterData') {
                    potentiallyAffected = true;
                }
                if (potentiallyAffected) break;
            }


            if (potentiallyAffected && this.currentSearchTerms.length > 0 && window.advancedFindConfig.config.settings.persistentHighlightsEnabled) {
                 
                 // Reapply highlights if the DOM changed significantly
                 this.debouncedReapplyHighlights();
            }
        }

         /**
          * Reapplies the last executed search.
          */
         reapplyHighlights() {
            if (this.currentSearchTerms.length > 0 && this.currentSearchOptions) {
                 
                 // Determine if it was a proximity search
                 if (this.currentSearchOptions.isProximity && this.currentSearchTerms.length === 2) {
                     this.highlightProximity(
                         this.currentSearchTerms[0],
                         this.currentSearchTerms[1],
                         this.currentSearchOptions.proximityValue,
                         this.currentSearchOptions,
                         () => {  } // No need to sendResponse here
                     );
                 } else {
                      this.highlight(
                          this.currentSearchTerms, // Pass the array
                          this.currentSearchOptions,
                          () => { console.log("Highlights reapplied after DOM change (Standard/Multi)."); } // No need to sendResponse here
                      );
                 }
            }
        }


         /**
          * Main function to highlight one or more terms.
          * @param {string[]} searchTerms - Array of terms/patterns to highlight.
          * @param {object} options - Search options (caseSensitive, wholeWords, useRegex, ignoreDiacritics, excludeTerm).
          * @param {function(number)} [callback] - Optional callback function receiving the total count.
          */
         highlight(searchTerms, options = {}, callback) {
            if (!this.markInstance) {
                console.error("HighlightManager: Mark instance not ready.");
                if (callback) callback(0);
                return;
            }
            if (!Array.isArray(searchTerms) || searchTerms.length === 0) {
                console.warn("HighlightManager: No valid search terms provided.");
                this.clearHighlights(); // Clear if terms are empty
                if (callback) callback(0);
                return;
            }

             this.stopObserver(); // Stop observer during highlighting

            

             // Store for persistence / reapply
             this.currentSearchTerms = [...searchTerms];
             this.currentSearchOptions = { ...options, isProximity: false }; // Ensure isProximity is false

             // Use local copy of config for styling
             const highlightConfig = window.advancedFindConfig.config.highlight;
             let totalCount = 0;

            this.markInstance.unmark({
                 // Ensure previous current highlight class is removed
                className: highlightConfig.currentHighlightClass,
                done: () => {
                    this.markInstance.unmark({
                         // Unmark all base highlights
                         className: highlightConfig.baseClass,
                         done: () => {
                             this.currentHighlights = []; // Reset highlights array
                             this.currentIndex = -1;
                             let termsProcessed = 0;

                             searchTerms.forEach((term, index) => {
                                if (!term) { // Skip empty terms resulting from split
                                     termsProcessed++;
                                     if (termsProcessed === searchTerms.length && callback) {
                                         this.updateHighlightListAndNavigation();
                                          this.startObserver(); // Restart observer
                                         callback(totalCount);
                                     }
                                     return;
                                }

                                 try {
                                     const regex = window.advancedFindSearchUtils.createSearchRegex(
                                         term,
                                         options.caseSensitive,
                                         options.wholeWords,
                                         options.useRegex, // Use the flag passed in options
                                         options.ignoreDiacritics
                                     );

                                     // Determine highlight class based on index, cycle through available classes
                                     const classIndex = index % highlightConfig.highlightClasses.length;
                                     const className = `${highlightConfig.baseClass} ${highlightConfig.highlightClasses[classIndex]}`;

                                     // --- Exclusion Logic ---
                                     const filterCallback = this.createExclusionFilter(options.excludeTerm, options.caseSensitive);

                                     this.markInstance.markRegExp(regex, {
                                         className: className,
                                         acrossElements: true, // Usually desired
                                         separateWordSearch: false, // Important for multi-word terms
                                         diacritics: !!options.ignoreDiacritics,
                                         caseSensitive: options.caseSensitive || false,
                                         filter: filterCallback, // Apply exclusion filter
                                         each: (element) => {
                                             // Optional: Do something with each marked element if needed
                                             // Add term info for export?
                                             element.dataset.searchTerm = term; // Store which term matched
                                             if (options.patternMetadata) {
                                                 element.dataset.patternId = options.patternMetadata.patternId || "";
                                                 element.dataset.patternLabel = options.patternMetadata.patternLabel || "";
                                                 element.dataset.patternCategoryId = options.patternMetadata.categoryId || "";
                                                 element.dataset.patternCategoryLabel = options.patternMetadata.categoryLabel || "";
                                                 if (Array.isArray(options.patternMetadata.tags)) {
                                                     element.dataset.patternTags = options.patternMetadata.tags.join(",");
                                                 }
                                             }
                                         },
                                         done: (count) => {
                                             
                                             totalCount += count;
                                             termsProcessed++;
                                             // Check if all terms are processed
                                             if (termsProcessed === searchTerms.length) {
                                                  this.updateHighlightListAndNavigation();
                                                  this.startObserver(); // Restart observer
                                                  if (callback) callback(totalCount);
                                                 // Optionally save persistent state here AFTER successful highlight
                                                 window.advancedFindPersistence?.saveState(this.currentSearchTerms, this.currentSearchOptions);
                                             }
                                         }
                                     });

                                 } catch (error) {
                                     console.error(`Error highlighting term "${term}":`, error);
                                      termsProcessed++;
                                      if (termsProcessed === searchTerms.length) {
                                           this.updateHighlightListAndNavigation(); // Update list even if errors occurred
                                            this.startObserver(); // Restart observer
                                           if (callback) callback(totalCount); // Report count found so far
                                      }
                                 }
                             });
                         }
                     });
                 }
             });
         }


        /**
         * Creates a filter function for mark.js to exclude matches based on a term.
         * @param {string} excludeTerm - The term to exclude. If empty, returns a passthrough filter.
         * @param {boolean} caseSensitive - Whether exclusion should be case-sensitive.
         * @returns {function} A filter function for mark.js (`(textNode, matchString, termCounter) => boolean`).
         */
        createExclusionFilter(excludeTerm, caseSensitive) {
            if (!excludeTerm) {
                return () => true; // No exclusion term, always keep the match
            }

            const excludePattern = excludeTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // Escape exclude term
            const excludeRegex = new RegExp(excludePattern, caseSensitive ? 'g' : 'gi');
            const contextWords = window.advancedFindConfig.config.behavior.excludeTermContextWords;

            return (textNode, matchString, termCounter, matchIndex) => {
                 // Check if the match itself contains the exclude term
                excludeRegex.lastIndex = 0; // Reset regex state
                if (excludeRegex.test(matchString)) {
                     
                    return false; // Exclude if the match *is* the exclude term
                }

                // Check surrounding context within the text node
                 const nodeText = textNode.textContent;
                 const matchStartIndex = textNode.textContent.indexOf(matchString, matchIndex.offset); // Find match start in node
                if (matchStartIndex === -1) return true; // Should not happen, but be safe

                 const matchEndIndex = matchStartIndex + matchString.length;

                 // Heuristic: Get N words before and after within the same text node
                 const textBefore = nodeText.substring(0, matchStartIndex).split(/\s+/).slice(-contextWords).join(' ');
                 const textAfter = nodeText.substring(matchEndIndex).split(/\s+/).slice(0, contextWords).join(' ');

                 const context = `${textBefore} ${matchString} ${textAfter}`;

                excludeRegex.lastIndex = 0; // Reset regex state
                if (excludeRegex.test(context)) {
                     
                    return false; // Exclude if context contains the term
                }

                // TODO: More advanced context checking across node boundaries? (Much harder)

                return true; // Keep the match if exclude term not found in match or context
            };
        }

        /**
         * Highlights proximity matches.
         * @param {string} term1 - First term.
         * @param {string} term2 - Second term.
         * @param {number} maxDistance - Maximum words between terms.
         * @param {object} options - Search options (caseSensitive, wholeWords, excludeTerm, ignoreDiacritics).
         * @param {function(number)} [callback] - Optional callback function receiving the count.
         */
         highlightProximity(term1, term2, maxDistance, options, callback) {
            if (!this.markInstance) {
                 console.error("HighlightManager: Mark instance not ready.");
                 if (callback) callback(0);
                 return;
             }
             if (!term1 || !term2) {
                  console.warn("HighlightManager: Both terms required for proximity search.");
                  this.clearHighlights();
                  if (callback) callback(0);
                  return;
              }

             this.stopObserver(); // Stop observer

             

              // Store for persistence / reapply
             this.currentSearchTerms = [term1, term2];
             this.currentSearchOptions = { ...options, isProximity: true, proximityValue: maxDistance }; // Mark as proximity

             // Use local config
              const highlightConfig = window.advancedFindConfig.config.highlight;

            this.markInstance.unmark({
                 className: highlightConfig.currentHighlightClass,
                 done: () => {
                     this.markInstance.unmark({
                        className: highlightConfig.baseClass, // Unmark all previous highlights
                        done: () => {
                            this.currentHighlights = [];
                            this.currentIndex = -1;

                             // --- Create Proximity Regex ---
                             const distanceType = options.distanceType === 'chars' ? 'chars' : 'words';
                             const requireOrder = !!options.requireOrder;
                             const sameParagraph = !!options.sameParagraph;
                             const patternMetadata = options.patternMetadata || null;

                            function escapeRegex(str) {
                                return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                            }

                            let escapedTerm1 = options.wholeWords ? `\\b${escapeRegex(term1)}\\b` : escapeRegex(term1);
                            let escapedTerm2 = options.wholeWords ? `\\b${escapeRegex(term2)}\\b` : escapeRegex(term2);

                            let intervening;
                            if (distanceType === 'chars') {
                                const safeDistance = Math.max(0, maxDistance);
                                intervening = `[\\s\\S]{0,${safeDistance}}?`;
                            } else {
                                intervening = `(?:\\W+\\w+){0,${maxDistance}}?\\W*?`;
                            }

                            const patternParts = [];
                            patternParts.push(`(${escapedTerm1}${intervening}${escapedTerm2})`);
                            if (!requireOrder) {
                                patternParts.push(`(${escapedTerm2}${intervening}${escapedTerm1})`);
                            }

                            const combinedPattern = patternParts.join('|');
                            const flags = options.caseSensitive ? "g" : "gi";
                            const elementsForValidation = sameParagraph ? [] : null;

                            try {
                                const combinedRegex = new RegExp(combinedPattern, flags);

                                const filterCallback = this.createExclusionFilter(options.excludeTerm, options.caseSensitive);

                                this.markInstance.markRegExp(combinedRegex, {
                                    className: `${highlightConfig.baseClass} ${highlightConfig.proximityHighlightClass}`,
                                    acrossElements: true,
                                    separateWordSearch: false,
                                    diacritics: !!options.ignoreDiacritics,
                                    caseSensitive: options.caseSensitive || false,
                                    filter: filterCallback,
                                    each: (element) => {
                                        element.dataset.searchTerm = `${term1} ~ ${term2}`;
                                        element.dataset.isProximity = "true";
                                        if (patternMetadata) {
                                            element.dataset.patternId = patternMetadata.patternId || "";
                                            element.dataset.patternLabel = patternMetadata.patternLabel || "";
                                            element.dataset.patternCategoryId = patternMetadata.categoryId || "";
                                            element.dataset.patternCategoryLabel = patternMetadata.categoryLabel || "";
                                            if (Array.isArray(patternMetadata.tags)) {
                                                element.dataset.patternTags = patternMetadata.tags.join(",");
                                            }
                                        }
                                        if (elementsForValidation) {
                                            elementsForValidation.push(element);
                                        }
                                    },
                                    done: (count) => {
                                        let validCount = count;

                                        if (elementsForValidation && elementsForValidation.length) {
                                            elementsForValidation.forEach((element) => {
                                                if (!this.isMatchInSameParagraph(element, term1, term2, options)) {
                                                    this.unwrapHighlightElement(element);
                                                    validCount = Math.max(0, validCount - 1);
                                                }
                                            });
                                        }

                                         this.updateHighlightListAndNavigation();
                                         this.startObserver(); // Restart observer
                                         if (callback) callback(validCount);
                                         // Save state
                                        window.advancedFindPersistence?.saveState(this.currentSearchTerms, this.currentSearchOptions);
                                    }
                                });
                            } catch (e) {
                                console.error("Error creating or using proximity regex:", e);
                                 this.startObserver(); // Restart observer even on error
                                 if (callback) callback(0);
                            }
                        }
                    });
                }
            });
        }

         /**
          * Updates the internal list of highlight elements after a search.
          */
         updateHighlightListAndNavigation() {
            this.currentHighlights = Array.from(document.querySelectorAll(`.${window.advancedFindConfig.config.highlight.baseClass}`));
            // Sort highlights based on their position in the document (important for reliable navigation)
             this.currentHighlights.sort((a, b) => {
                const position = a.compareDocumentPosition(b);
                if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
                if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
                return 0;
             });

            this.currentIndex = -1; // Reset navigation index
            // Remove 'current' class from any previous navigation target
             this.currentHighlights.forEach(el => el.classList.remove(window.advancedFindConfig.config.highlight.currentHighlightClass));
             
         }


        /**
         * Clears all highlights from the page.
         */
        clearHighlights() {
             this.stopObserver(); // Stop observer before clearing
             
             if (!this.markInstance) return;

             this.markInstance.unmark({
                 // Remove all classes associated with this extension
                 className: window.advancedFindConfig.config.highlight.baseClass,
                 done: () => {
                     this.currentHighlights = [];
                     this.currentIndex = -1;
                     this.currentSearchTerms = [];
                     this.currentSearchOptions = null;
                     
                     // Clear persistent state as well
                     window.advancedFindPersistence?.clearState();
                      // Optionally restart observer if needed, but usually not after clear
                 }
             });
         }


        /**
         * Navigates to the next or previous highlight.
         * @param {'next' | 'previous'} direction - The direction to navigate.
         */
         navigate(direction) {
            if (!this.currentHighlights.length) {
                
                return;
            }

             // Remove current class from the previously focused element
            if (this.currentIndex >= 0 && this.currentHighlights[this.currentIndex]) {
                this.currentHighlights[this.currentIndex].classList.remove(window.advancedFindConfig.config.highlight.currentHighlightClass);
            }

             // Calculate the new index
            if (direction === "next") {
                this.currentIndex = (this.currentIndex + 1) % this.currentHighlights.length;
            } else if (direction === "previous") {
                this.currentIndex = (this.currentIndex - 1 + this.currentHighlights.length) % this.currentHighlights.length;
            } else {
                 console.warn("Navigate: Invalid direction", direction);
                 return; // Invalid direction
            }

             // Apply style and scroll to the new current highlight
            const targetElement = this.currentHighlights[this.currentIndex];
            if (targetElement) {
                targetElement.classList.add(window.advancedFindConfig.config.highlight.currentHighlightClass);
                // Check if element is visible before scrolling
                 const rect = targetElement.getBoundingClientRect();
                 const isVisible = rect.top >= 0 && rect.left >= 0 && rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) && rect.right <= (window.innerWidth || document.documentElement.clientWidth);

                 if (!isVisible) {
                     targetElement.scrollIntoView({
                         behavior: "smooth", // Consider 'auto' if smooth is problematic
                         block: "center",
                         inline: "nearest"
                     });
                 }
                
             } else {
                  console.warn(`Navigate: Target element at index ${this.currentIndex} not found.`);
                  // Reset index if element is missing?
                  this.currentIndex = -1;
             }
        }

        /**
         * Gathers details of all current highlights for export.
         * @returns {Array<object>} Array of { text: string, term: string, context: string, isProximity: boolean }
          */
         getHighlightsForExport() {
            const exportData = [];
            const highlights = document.querySelectorAll(`.${window.advancedFindConfig.config.highlight.baseClass}`);
             const contextChars = 100; // Number of characters before/after for context

             highlights.forEach(el => {
                 const text = el.textContent || "";
                 const term = el.dataset.searchTerm || ""; // Get term from data attribute
                 const isProximity = el.dataset.isProximity === "true";

                 // Attempt to get some context
                 let contextBefore = "";
                 let contextAfter = "";
                 let currentNode = el.previousSibling;
                 while (currentNode && contextBefore.length < contextChars) {
                     if (currentNode.nodeType === Node.TEXT_NODE) {
                         contextBefore = currentNode.textContent.slice(-contextChars + contextBefore.length) + contextBefore;
                     }
                     currentNode = currentNode.previousSibling;
                     // Basic check to avoid traversing too far up
                     if (!currentNode || currentNode.nodeType === Node.ELEMENT_NODE) break;
                 }
                 currentNode = el.nextSibling;
                 while (currentNode && contextAfter.length < contextChars) {
                     if (currentNode.nodeType === Node.TEXT_NODE) {
                         contextAfter += currentNode.textContent.slice(0, contextChars - contextAfter.length);
                     }
                     currentNode = currentNode.nextSibling;
                     if (!currentNode || currentNode.nodeType === Node.ELEMENT_NODE) break;
                 }
                 // Simple context from surrounding text nodes (can be improved)
                 const context = `${contextBefore.trim()} **${text}** ${contextAfter.trim()}`;


                exportData.push({
                    text: text,
                    term: term,
                    context: context.replace(/\s+/g, ' ').trim(), // Clean up whitespace
                    isProximity: isProximity,
                    patternId: el.dataset.patternId || "",
                    patternLabel: el.dataset.patternLabel || "",
                    patternCategoryId: el.dataset.patternCategoryId || "",
                    patternCategoryLabel: el.dataset.patternCategoryLabel || "",
                    patternTags: el.dataset.patternTags ? el.dataset.patternTags.split(',') : []
                });
            });
            return exportData;
        }

        getParagraphContainer(element) {
            if (!element || element.nodeType !== Node.ELEMENT_NODE) return null;
            return element.closest('p, li, blockquote, dt, dd, address, td, th');
        }

        isMatchInSameParagraph(element, term1, term2, options) {
            const container = this.getParagraphContainer(element);
            if (!container) return false;
            const text = container.innerText || container.textContent || '';
            if (!text) return false;

            try {
                const regex1 = window.advancedFindSearchUtils.createSearchRegex(
                    term1,
                    options.caseSensitive,
                    options.wholeWords,
                    options.useRegex,
                    options.ignoreDiacritics
                );
                const regex2 = window.advancedFindSearchUtils.createSearchRegex(
                    term2,
                    options.caseSensitive,
                    options.wholeWords,
                    options.useRegex,
                    options.ignoreDiacritics
                );

                regex1.lastIndex = 0;
                if (!regex1.test(text)) return false;
                regex2.lastIndex = 0;
                return regex2.test(text);
            } catch (error) {
                console.warn('Paragraph validation failed:', error);
                return false;
            }
        }

        unwrapHighlightElement(element) {
            if (!element || !element.parentNode) return;
            const parent = element.parentNode;
            while (element.firstChild) {
                parent.insertBefore(element.firstChild, element);
            }
            parent.removeChild(element);
        }


    } // End of HighlightManager class

    // Expose the manager instance globally within the content script's context
    window.highlightManager = new HighlightManager();
    

})();
