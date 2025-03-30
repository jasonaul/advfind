(() => {
    const config = {
        highlight: {
            baseClass: "afe-highlight", // Base class for all highlights
            currentHighlightClass: "afe-highlight-current",
            proximityHighlightClass: "afe-highlight-proximity",
             // Array for multi-term colors, starting with the primary highlight color
            highlightClasses: [
                "afe-highlight-term-0", // Corresponds to defaultHighlightColor
                "afe-highlight-term-1",
                "afe-highlight-term-2",
                "afe-highlight-term-3",
                // Add more classes if needed
            ],
            // Default styles (can be overridden by user settings via injected styles)
            styles: [
                { backgroundColor: "#ffff00", color: "black" }, // Default/Term 0
                { backgroundColor: "#FFA07A", color: "black" }, // Term 1 (Light Salmon)
                { backgroundColor: "#98FB98", color: "black" }, // Term 2 (Pale Green)
                { backgroundColor: "#ADD8E6", color: "black" }, // Term 3 (Light Blue)
            ],
            proximityStyle: { backgroundColor: "lightgreen", color: "black" },
            currentStyle: { backgroundColor: "lightblue", color: "black" }
        },
        defaults: {
            // ... (existing defaults) ...
        },
        settings: {
            defaultHighlightColor: "#ffff00", // Term 0 color
            multiHighlightColors: [ // Defaults matching highlight.styles
                 "#FFA07A", "#98FB98", "#ADD8E6"
            ],
            defaultDisplayMode: "popup",
            searchHistoryEnabled: true, // Default setting
            maxSearchHistory: 10,
            persistentHighlightsEnabled: true, // Default setting
            defaultAnimationSpeed: 300,
            defaultIgnoreDiacritics: false,
        },
        behavior: {
             // How many words of context to check for exclusions (adjust as needed)
             excludeTermContextWords: 3,
        }
    };

    const tickMarkColor = "rgba(255, 0, 0, 0.5)"; // Keep tick mark color simple for now

    // Function to update config based on stored settings (called from content/popup)
    function updateConfigFromStorage(settings) {
        if (!settings) return;
        config.settings.defaultHighlightColor = settings.highlightColor || config.settings.defaultHighlightColor;
        config.settings.searchHistoryEnabled = settings.searchHistoryEnabled !== undefined ? settings.searchHistoryEnabled : config.settings.searchHistoryEnabled;
        config.settings.persistentHighlightsEnabled = settings.persistentHighlightsEnabled !== undefined ? settings.persistentHighlightsEnabled : config.settings.persistentHighlightsEnabled;
        config.settings.ignoreDiacritics = settings.ignoreDiacritics !== undefined ? settings.ignoreDiacritics : config.settings.defaultIgnoreDiacritics;
         // Update multi-term colors if stored
        if (settings.multiHighlightColors && Array.isArray(settings.multiHighlightColors)) {
             config.settings.multiHighlightColors = settings.multiHighlightColors;
             // Optionally update the config.highlight.styles array too, but injected styles are priority
        }

        // Update the primary style in the styles array
        config.highlight.styles[0] = {
            backgroundColor: config.settings.defaultHighlightColor,
            color: "black" // Assuming black text is always desired
        };
         // Update subsequent styles based on stored multi-colors
        for (let i = 0; i < config.settings.multiHighlightColors.length; i++) {
            if (config.highlight.styles[i + 1]) {
                config.highlight.styles[i + 1].backgroundColor = config.settings.multiHighlightColors[i];
            }
        }


        console.log("Config updated from storage:", config);
    }


    window.advancedFindConfig = {
         config,
         tickMarkColor,
         updateConfigFromStorage // Expose updater function
     };
})();