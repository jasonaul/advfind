(() => {
    function getLibraryConfig() {
        return window.advancedFindConfig?.config?.library || { categories: [] };
    }

    function getCategories() {
        const library = getLibraryConfig();
        return Array.isArray(library.categories) ? library.categories : [];
    }

    function getCategoryById(categoryId) {
        return getCategories().find(category => category.id === categoryId);
    }

    function getPatternById(patternId) {
        for (const category of getCategories()) {
            const match = category.patterns?.find(pattern => pattern.id === patternId);
            if (match) {
                return { category, pattern: match };
            }
        }
        return null;
    }

    function getFlattenedPatterns() {
        return getCategories().flatMap(category =>
            (category.patterns || []).map(pattern => ({
                categoryId: category.id,
                categoryLabel: category.label,
                ...pattern
            }))
        );
    }

    window.advancedFindPatternLibrary = {
        getCategories,
        getCategoryById,
        getPatternById,
        getFlattenedPatterns
    };
})();
