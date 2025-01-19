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

    window.advancedFindSearchUtils = {
        createSearchRegex
    };
})();