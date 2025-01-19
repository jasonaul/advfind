(() => {
    const config = {
        highlight: {
            highlightClass: "afe-highlight",
            currentHighlightClass: "afe-highlight-current",
            proximityHighlightClass: "afe-highlight-proximity",
            highlightStyle: {
                backgroundColor: "yellow",
                color: "black",
            },
            currentHighlightStyle: {
                backgroundColor: "lightblue",
                color: "black"
            },
            proximityHighlightStyle: {
                backgroundColor: "lightgreen",
                color: "black"
            },
        },
        defaults: {
            misspelling: true,
            proximitySearch: false,
            proximityValue: 5,
            isProximityCharBased: true,
        }
    };

    const tickMarkColor = "rgba(255, 0, 0, 0.5)";

    window.advancedFindConfig = { config, tickMarkColor };
})();