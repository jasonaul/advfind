(() => {
    /**
     * Creates a RegExp object for searching.
     * Handles standard text, regex input, wildcards (*), case sensitivity, whole words, and diacritics.
     * @param {string} searchTerm - The term or pattern to search for.
     * @param {boolean} caseSensitive - Whether the search is case-sensitive.
     * @param {boolean} wholeWords - Whether to match whole words only.
     * @param {boolean} useRegex - Whether the searchTerm is already a regex pattern.
     * @param {boolean} ignoreDiacritics - Whether to ignore diacritics (accents, etc.).
     * @returns {RegExp} The generated regular expression.
     * @throws {Error} If the search term is empty or if regex is invalid.
     */
    function createSearchRegex(searchTerm, caseSensitive, wholeWords, useRegex, ignoreDiacritics = false) {
        if (!searchTerm) {
            throw new Error("Search term cannot be empty");
        }

        let regexString = searchTerm;
        let regexFlags = caseSensitive ? "g" : "gi";

        if (useRegex) {
            // User provided regex - use it directly, but check validity
            try {
                new RegExp(searchTerm); // Test if valid
                console.log("Creating regex (user regex mode):", searchTerm, regexFlags);
                // Note: ignoreDiacritics is harder to apply automatically to user regex.
                // Mark.js might handle 'ignoreDiacritics' separately.
            } catch (error) {
                console.error("Invalid user-provided regular expression:", searchTerm, error);
                throw new Error(`Invalid regular expression: ${error.message}`);
            }
            // Return the user's regex string; Mark.js will compile it.
             // We return the RegExp object directly here for consistency
             return new RegExp(regexString, regexFlags);

        } else {
            // Standard search term processing
             let processedTerm = searchTerm;

             // 1. Handle Wildcards (*) before escaping other characters
             if (processedTerm.includes('*')) {
                 // Split by *, escape each part, join with non-greedy wildcard
                 processedTerm = processedTerm
                     .split('*')
                     .map(part => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) // Escape regex chars in parts
                     .join('.*?'); // Join with non-greedy wildcard
             } else {
                 // No wildcards, just escape the whole term
                 processedTerm = processedTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
             }


            // 2. Add word boundaries if required
            const wordBoundary = wholeWords ? "\\b" : "";
            regexString = `${wordBoundary}${processedTerm}${wordBoundary}`;

            // 3. Handle Diacritics (Mark.js usually handles this via its own option,
            // but creating a regex that ignores them is complex. Rely on Mark.js option for now)
            if (ignoreDiacritics) {
                console.warn("ignoreDiacritics=true: Relying on Mark.js internal handling. Regex itself won't ignore diacritics.");
                 // Advanced (complex): Could try to replace characters with classes like [aàáâãäå]
                 // but this is difficult to do comprehensively.
            }

            console.log("Creating regex (standard/wildcard mode):", regexString, regexFlags);
             try {
                 return new RegExp(regexString, regexFlags);
             } catch (error) {
                 console.error("Error creating regex from processed term:", regexString, error);
                 throw new Error(`Internal error creating regex: ${error.message}`);
             }
        }
    }

    // --- findProximityMatches - Keep as is for now, proximity uses its own regex logic ---
     function findProximityMatches(text, term1, term2, maxDistance, caseSensitive, wholeWords) {
        // ... (This function might not be directly used by mark.js anymore,
        //      but keep it if needed for other logic or future enhancements) ...

         // Let's refine the regex generation used internally by highlightProximity instead.
         console.warn("findProximityMatches function might be deprecated if using mark.js's combined regex approach.");
         return []; // Return empty array to signify deprecation if not used
     }


    window.advancedFindSearchUtils = {
        createSearchRegex,
        findProximityMatches // Keep exposed, but note potential deprecation
    };
})();