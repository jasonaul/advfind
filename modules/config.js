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
        },
        library: {
            categories: [
                {
                    id: "legal",
                    label: "Legal Clauses",
                    description: "Common contractual phrases that often require review.",
                    patterns: [
                        {
                            id: "force_majeure",
                            label: "Force majeure clause",
                            description: "Detects references to force majeure obligations or events.",
                            terms: ["force majeure"],
                            options: { caseSensitive: false, wholeWords: false, useRegex: false },
                            tags: ["risk", "obligation"]
                        },
                        {
                            id: "notwithstanding",
                            label: "\"Notwithstanding the foregoing\"",
                            description: "Highlights sweeping carve-outs that may override prior language.",
                            terms: ["notwithstanding the foregoing"],
                            options: { caseSensitive: false, wholeWords: false, useRegex: false },
                            tags: ["carve-out"]
                        },
                        {
                            id: "without_limitation",
                            label: "\"Without limitation\" language",
                            description: "Finds broad qualifiers that may expand scope unexpectedly.",
                            terms: ["without limitation", "without limiting the generality"],
                            options: { caseSensitive: false, wholeWords: false, useRegex: false },
                            tags: ["scope"]
                        }
                    ]
                },
                {
                    id: "code",
                    label: "Code Smells",
                    description: "Patterns that often indicate debugging or risky code paths.",
                    patterns: [
                        {
                            id: "todo_fixme",
                            label: "TODO / FIXME markers",
                            description: "Surfaces TODO or FIXME comments left in code.",
                            terms: ["TODO", "FIXME"],
                            options: { caseSensitive: false, wholeWords: false, useRegex: false },
                            tags: ["maintenance", "debt"]
                        },
                        {
                            id: "console_log",
                            label: "Console logging",
                            description: "Finds console.log statements that may need removal before release.",
                            terms: ["\\bconsole\\.log\\s*\\("],
                            options: { caseSensitive: false, wholeWords: false, useRegex: true },
                            tags: ["debug"]
                        },
                        {
                            id: "eval_usage",
                            label: "eval usage",
                            description: "Flags eval calls which can create security concerns.",
                            terms: ["\\beval\\s*\\("],
                            options: { caseSensitive: false, wholeWords: false, useRegex: true },
                            tags: ["security", "risk"]
                        }
                    ]
                }
            ]
        }
    };

    const tickMarkColor = config.settings.defaultHighlightColor;

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

        if (window.advancedFindConfig) {
            window.advancedFindConfig.tickMarkColor = config.settings.defaultHighlightColor;
        }
    }


    window.advancedFindConfig = {
         config,
         tickMarkColor,
         updateConfigFromStorage // Expose updater function
     };
})();
