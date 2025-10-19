(() => {
    const DIACRITICS_REGEX = /[\u0300-\u036f]/g;

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
            try {
                new RegExp(searchTerm);
            } catch (error) {
                throw new Error(`Invalid regular expression: ${error.message}`);
            }
            return new RegExp(regexString, regexFlags);
        } else {
            let processedTerm = searchTerm;

            if (processedTerm.includes('*')) {
                processedTerm = processedTerm
                    .split('*')
                    .map(part => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
                    .join('.*?');
            } else {
                processedTerm = processedTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            }

            const wordBoundary = wholeWords ? "\\b" : "";
            regexString = `${wordBoundary}${processedTerm}${wordBoundary}`;

            try {
                return new RegExp(regexString, regexFlags);
            } catch (error) {
                throw new Error(`Internal error creating regex: ${error.message}`);
            }
        }
    }

    function findProximityMatches() {
        console.warn("findProximityMatches is deprecated for the current implementation.");
        return [];
    }

    function stripDiacritics(value = "") {
        if (typeof value !== "string" || !value) return value || "";
        return value.normalize("NFD").replace(DIACRITICS_REGEX, "");
    }

    function buildExcludeRegex(source, caseSensitive, treatAsRegex) {
        if (!source) return null;
        let pattern = source;
        if (!treatAsRegex) {
            pattern = source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        }
        try {
            return new RegExp(pattern, caseSensitive ? "g" : "gi");
        } catch (error) {
            console.warn("Failed to initialise exclusion regex:", error);
            return null;
        }
    }

    function countMatchesInText(rawText, terms, options = {}, excludeTerm = "", excludeContextWords = 3) {
        const text = typeof rawText === "string" ? rawText : "";
        const searchTerms = Array.isArray(terms) ? terms : [];
        if (!text || searchTerms.length === 0) {
            return { total: 0, perTerm: searchTerms.map(term => ({ term, count: 0 })) };
        }

        const {
            caseSensitive = false,
            wholeWords = false,
            useRegex = false,
            ignoreDiacritics = false
        } = options || {};

        const allowNormalization = ignoreDiacritics && !useRegex;
        const processedText = allowNormalization ? stripDiacritics(text) : text;
        const processedExclude = allowNormalization ? stripDiacritics(excludeTerm) : excludeTerm;
        const excludeRegex = buildExcludeRegex(processedExclude, caseSensitive, useRegex);
        const contextRadius = Math.max(0, excludeContextWords | 0) * 40;

        const perTerm = searchTerms.map(originalTerm => {
            if (!originalTerm) return { term: originalTerm, count: 0 };

            const workingTerm = allowNormalization ? stripDiacritics(originalTerm) : originalTerm;
            let regex;
            try {
                regex = createSearchRegex(workingTerm, caseSensitive, wholeWords, useRegex, false);
            } catch (error) {
                return { term: originalTerm, count: 0, error: error.message };
            }

            let count = 0;
            let match;
            regex.lastIndex = 0;

            while ((match = regex.exec(processedText)) !== null) {
                if (excludeRegex) {
                    const start = Math.max(0, match.index - contextRadius);
                    const end = Math.min(processedText.length, regex.lastIndex + contextRadius);
                    const slice = processedText.slice(start, end);
                    excludeRegex.lastIndex = 0;
                    if (excludeRegex.test(slice)) {
                        if (regex.lastIndex === match.index) {
                            regex.lastIndex += match[0]?.length || 1;
                        }
                        continue;
                    }
                }

                count++;

                if (!match[0] || match[0].length === 0) {
                    regex.lastIndex += 1;
                }
            }

            return { term: originalTerm, count };
        });

        const total = perTerm.reduce((sum, entry) => sum + (entry.count || 0), 0);
        return { total, perTerm };
    }

    window.advancedFindSearchUtils = {
        createSearchRegex,
        findProximityMatches,
        stripDiacritics,
        countMatchesInText
    };
})();
