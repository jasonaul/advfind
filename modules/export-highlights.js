(() => {

    /**
     * Formats highlight data into a plain text string.
     * @param {Array<object>} highlights - Array of highlight objects {text, term, context, isProximity}.
     * @param {string} pageUrl - URL of the page.
     * @param {string} pageTitle - Title of the page.
     * @returns {string} Formatted text content.
     */
    function formatAsText(highlights, pageUrl, pageTitle) {
        let output = `Highlights from: ${pageTitle || 'Untitled Page'}\n`;
        output += `URL: ${pageUrl}\n`;
        output += `Exported: ${new Date().toLocaleString()}\n`;
        output += `Total Highlights: ${highlights.length}\n`;
        output += "----------------------------------------\n\n";

        highlights.forEach((h, index) => {
            output += `[Highlight ${index + 1}]\n`;
            output += `Term(s): ${h.term}\n`;
            output += `Text: ${h.text}\n`;
             output += `Context: ${h.context || 'N/A'}\n`; // Include context
             if (h.isProximity) {
                 output += `Type: Proximity Match\n`;
             }
            output += "\n";
        });

        return output;
    }

    /**
     * Formats highlight data into a CSV string.
     * @param {Array<object>} highlights - Array of highlight objects {text, term, context, isProximity}.
     * @param {string} pageUrl - URL of the page.
     * @param {string} pageTitle - Title of the page.
     * @returns {string} Formatted CSV content.
     */
    function formatAsCsv(highlights, pageUrl, pageTitle) {
         // Function to escape CSV fields containing commas, quotes, or newlines
         const escapeCsvField = (field) => {
             if (field === null || field === undefined) return '';
             let stringField = String(field);
             // If the field contains a comma, newline, or double quote, enclose it in double quotes
             if (stringField.includes(',') || stringField.includes('\n') || stringField.includes('"')) {
                 // Escape existing double quotes by doubling them
                 stringField = stringField.replace(/"/g, '""');
                 return `"${stringField}"`;
             }
             return stringField;
         };

        // Define headers
        const headers = ["Index", "Term", "Highlighted Text", "Context", "Type", "Page Title", "Page URL"];
        let csvContent = headers.map(escapeCsvField).join(",") + "\n"; // Header row

        // Add data rows
        highlights.forEach((h, index) => {
            const row = [
                index + 1,
                h.term,
                h.text,
                h.context || '', // Use empty string if no context
                h.isProximity ? "Proximity" : "Standard/Regex",
                pageTitle || '',
                pageUrl || ''
            ];
            csvContent += row.map(escapeCsvField).join(",") + "\n";
        });

        return csvContent;
    }


    /**
     * Triggers a download of the provided text content.
     * @param {string} content - The text content to download.
     * @param {string} filename - The suggested filename for the download.
     * @param {string} mimeType - The MIME type (e.g., 'text/plain', 'text/csv').
     */
    function triggerDownload(content, filename, mimeType) {
        try {
            const blob = new Blob([content], { type: mimeType });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.style.display = 'none'; // Hide the link

            document.body.appendChild(a); // Append to body to ensure it's clickable
            a.click(); // Simulate click to trigger download

            // Cleanup
            document.body.removeChild(a); // Remove the link
            URL.revokeObjectURL(url); // Release the object URL
            console.log(`Download triggered for ${filename}`);

        } catch (error) {
            console.error("Error triggering download:", error);
             // Optionally inform the user via status update in popup
        }
    }

    /**
     * Main export function called by the popup.
     * @param {Array<object>} highlightsData - Data gathered by content script.
     * @param {string} pageUrl - URL of the page.
     * @param {string} pageTitle - Title of the page.
     * @param {'txt' | 'csv'} format - Desired export format (default 'txt').
     */
    function exportHighlights(highlightsData, pageUrl, pageTitle, format = 'csv') { // Default to CSV
        if (!highlightsData || highlightsData.length === 0) {
            console.warn("Export: No highlight data provided.");
            return; // Or notify user via popup status
        }

         let fileContent = '';
         let fileExtension = '';
         let mimeType = '';
         const filenameBase = `highlights_${pageTitle || 'page'}_${new Date().toISOString().split('T')[0]}`.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);


        if (format === 'csv') {
             fileContent = formatAsCsv(highlightsData, pageUrl, pageTitle);
             fileExtension = 'csv';
             mimeType = 'text/csv;charset=utf-8;';
         } else { // Default to text
             fileContent = formatAsText(highlightsData, pageUrl, pageTitle);
             fileExtension = 'txt';
             mimeType = 'text/plain;charset=utf-8;';
         }

         const filename = `${filenameBase}.${fileExtension}`;
         triggerDownload(fileContent, filename, mimeType);
    }


    // Expose the main export function globally
    window.advancedFindExporter = {
        exportHighlights
    };

    console.log("Advanced Find: Export module loaded.");

})();