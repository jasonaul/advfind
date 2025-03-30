# Advanced Find V - Chrome Extension

## Overview

Advanced Find V is a powerful search extension for Google Chrome that significantly enhances your ability to find and analyze text on any webpage. Go beyond the basic Ctrl+F with features designed for precision and efficiency.

**Key Features:**

*   **Multi-Term Search:** Enter multiple search terms separated by commas (`,`) to highlight each term in a different color (configurable).
*   **Standard Search with Wildcards:** Find occurrences of a term, using `*` as a wildcard for partial matches.
*   **Regex Search:** Utilize the power of regular expressions for complex pattern matching, with helpful presets (Numbers, Emails, URLs).
*   **Proximity Search:** Locate areas where two specific terms appear near each other (within a configurable word distance).
*   **Exclusion Term:** Refine your searches by specifying a term that *should not* be present near your main search results.
*   **Flexible Options:** Control case sensitivity, whole word matching, and ignore diacritics (e.g., treat `é` the same as `e`).
*   **Clear Highlighting:** Matches are clearly highlighted on the page. The currently navigated match receives extra emphasis. Multi-term search uses distinct colors.
*   **Match Navigation:** Easily jump between highlighted matches using "Next" and "Previous" buttons.
*   **Tick Bar:** A visual overview of match locations is displayed as small tick marks along the right edge of the browser window. Click a tick mark to instantly scroll to that match.
*   **Search History:** Quickly re-run previous searches via the automatically saved history list in the popup.
*   **Persistent Highlights:** Highlights can optionally remain on the page even after you reload it (configurable in Settings).
*   **Data Export:** Export the text content and context of all your highlighted matches to a CSV file.
*   **Customizable Settings:** Configure default and multi-term highlight colors, enable/disable history and persistence, and manage other behaviors via the Settings panel.
*   **Modern UI:** A clean and intuitive interface designed for ease of use.
*   **Context Menu:** Right-click on a page and select "Toggle Advanced Find Sidebar" (Note: Sidebar mode itself may require further implementation if not fully built out).

## Installation

1.  **Clone or Download:** Get the extension files from the repository.
2.  **Open Chrome Extensions:** Navigate to `chrome://extensions/` in your Chrome browser.
3.  **Enable Developer Mode:** Find the "Developer mode" toggle (usually in the top-right corner) and make sure it's switched **ON**.
4.  **Load Unpacked:** Click the "Load unpacked" button.
5.  **Select Folder:** Browse to and select the main folder containing the extension's files (the one with `manifest.json` inside).
6.  **Done:** The "Advanced Find V" extension icon should appear in your Chrome toolbar.

## How to Use

### Opening the Extension

*   Click the "Advanced Find V" icon in your Chrome toolbar to open the main search popup.

### Main Search Interface (Standard/Multi-Term/Wildcard)

1.  **Enter Term(s):**
    *   **Single Term:** Type your word or phrase. Use `*` for wildcards (e.g., `find*` matches `finding`, `finds`, etc.).
    *   **Multiple Terms:** Enter terms separated by a comma (`,`). Each term will get a different highlight color (up to the number of configured colors). Live search is disabled when using commas.
2.  **Exclude Term (Optional):** Enter a term in the "Exclude term" field. Matches containing or near this term will be ignored.
3.  **Set Options:** Use the checkboxes:
    *   **Case Sensitive:** Matches must have the exact same capitalization.
    *   **Whole Words:** Only matches the term if it appears as a complete word (not part of another word). Doesn't apply to multi-term search directly but can be used with wildcard searches.
    *   **Ignore Diacritics:** Treats characters like `é`, `ö`, `ñ` the same as `e`, `o`, `n`.
4.  **Search:** Click the **"Search / Next"** button.
    *   The first click performs the search and highlights matches.
    *   Subsequent clicks on the same button (without changing the term) navigate to the **next** match.
5.  **Navigate:** Use the dedicated **"Previous"** and **"Next"** buttons to cycle through matches.
6.  **Clear:** Click **"Clear"** to remove all highlights, clear input fields, and reset the search history storage.
7.  **Export:** Click **"Export"** to download a CSV file containing details about all current highlights.

### Regex Search Mode

1.  **Activate:** Check the **"Regex Mode"** box. The interface will change.
2.  **Enter Pattern:** Type your regular expression into the main input field.
3.  **Presets (Optional):** Select a radio button (Numbers, Emails, URLs) to populate the input with a common pattern. Select "Custom" to keep your typed pattern.
4.  **Exclude Term (Optional):** Use the "Exclude term" field specific to Regex mode.
5.  **Set Options:** "Case Sensitive" and "Ignore Diacritics" apply. "Whole Words" does not apply directly to regex patterns.
6.  **Search / Navigate:** Use the **"Search / Next"**, **"Previous"**, and **"Next"** buttons as in Standard mode.
7.  **Help:** Click the **"?"** button for a quick Regex syntax guide.
8.  **Clear/Export:** Use the dedicated buttons for Regex mode.
9.  **Return:** Click **"← Return to Standard Mode"** to switch back.

### Proximity Search Mode

1.  **Activate:** Check the **"Proximity Search"** box. This will disable Regex Mode if active and reveal proximity controls.
2.  **Enter Terms:** Input the two terms you want to find near each other.
3.  **Set Distance:** Adjust the "Max Words Between" value.
4.  **Set Options:** "Case Sensitive", "Whole Words" (applies to the individual terms), and "Ignore Diacritics" apply. Exclusion is currently disabled for proximity searches.
5.  **Search:** Click the **"Search Proximity"** button. Regions containing both terms within the specified distance will be highlighted.
6.  **Navigate/Clear/Export:** Use the main navigation, clear, and export buttons.

### Search History

*   Your recent searches (Standard, Regex, Proximity formats) are listed in the popup (if enabled in Settings).
*   Click any item in the list to instantly populate the search input and re-run that search in the current mode (Standard or Regex).

### Settings Panel

1.  **Access:** Click the gear icon (⚙️) in the popup header.
2.  **Options:**
    *   **Default Highlight Color:** Set the main color used for single-term searches and the first term in multi-term searches.
    *   **Multi-Highlight Colors:** Set colors for the 2nd, 3rd, etc., terms in a multi-term search.
    *   **Ignore Diacritics:** Global setting for ignoring accents (mirrors the checkbox on the main panel).
    *   **Enable Search History:** Toggle the history feature on/off.
    *   **Enable Persistent Highlights:** If enabled, the extension will try to re-apply the last search highlights when you reload a page.
3.  Changes are saved automatically when you modify a setting. Click the 'X' or outside the modal to close.

### Tick Bar & Context Menu

*   Look for small colored lines on the far right of your browser window. These indicate where matches are located on the page. Click one to scroll there.
*   Right-click on a webpage and select "Toggle Advanced Find Sidebar" (Note: Full sidebar UI may depend on future development).

## Troubleshooting

*   **Extension Unresponsive / "Failed to retrieve content":** This often indicates the connection between the popup and the web page's content script was lost or never established.
    *   Try **refreshing the web page** first.
    *   Try **reloading the extension** from `chrome://extensions/` (use the toggle switch or the refresh icon).
    *   Ensure the website isn't restricted (e.g., `chrome://` pages, other extension pages).
    *   Check if the website uses complex techniques (shadow DOM, dynamic content loading) that might interfere with script injection or DOM monitoring.
*   **Checkboxes Not Changing Visually:** If the checkboxes don't seem to check/uncheck, try reloading the extension and refreshing the page. Ensure no browser settings are blocking JavaScript execution for popups.
*   **No Matches:** Double-check your term, options (especially Case Sensitive/Whole Words), and the selected mode (Standard vs Regex vs Proximity). Ensure the "Exclude Term" field isn't unintentionally filtering results.
*   **Incorrect Highlighting on Dynamic Pages:** On pages that load content dynamically (like infinite scrolls or SPAs), highlights might not appear on newly loaded content automatically unless Persistent Highlights are enabled and the DOM observer successfully reapplies them. A manual re-search might be needed.

---
