(() => {
    function createSearchRegex(searchTerm, caseSensitive, wholeWords, useRegex) {
        if (!searchTerm) {
            throw new Error("Search term cannot be empty");
        }

        let regexFlags = caseSensitive ? "g" : "gi";
        console.log("Creating regex with flags:", regexFlags);

        if (useRegex) {
            try {
                console.log("Creating regex (regex mode):", searchTerm, regexFlags);
                return new RegExp(searchTerm, regexFlags);
            } catch (error) {
                console.error("Invalid regular expression:", searchTerm);
                throw new Error("Invalid regular expression");
            }
        } else {
            // Escape special regex characters in the search term
            const escapedSearchTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const wordBoundary = wholeWords ? "\\b" : "";
            const regexString = `${wordBoundary}${escapedSearchTerm}${wordBoundary}`;
            console.log("Creating regex (normal mode):", regexString, regexFlags);
            return new RegExp(regexString, regexFlags);
        }
    }

    function findProximityMatches(text, term1, term2, maxDistance, caseSensitive) {
        const flags = caseSensitive ? 'g' : 'gi';
        const regex1 = new RegExp(`\\b${term1}\\b`, flags);
        const regex2 = new RegExp(`\\b${term2}\\b`, flags);
        
        // Split text into words
        const words = text.split(/\s+/);
        const matches = [];
        
        // Find all occurrences of both terms
        for (let i = 0; i < words.length; i++) {
            if (words[i].match(regex1)) {
                // Look ahead for term2
                for (let j = i + 1; j <= Math.min(i + maxDistance, words.length - 1); j++) {
                    if (words[j].match(regex2)) {
                        matches.push({
                            start: i,
                            end: j,
                            text: words.slice(i, j + 1).join(' ')
                        });
                    }
                }
            } else if (words[i].match(regex2)) {
                // Look ahead for term1
                for (let j = i + 1; j <= Math.min(i + maxDistance, words.length - 1); j++) {
                    if (words[j].match(regex1)) {
                        matches.push({
                            start: i,
                            end: j,
                            text: words.slice(i, j + 1).join(' ')
                        });
                    }
                }
            }
        }
        
        return matches;
    }

    window.advancedFindSearchUtils = {
        createSearchRegex,
        findProximityMatches
    };
})();