# Advanced Find Chrome Extension

## Overview

Advanced Find is a powerful search extension for Google Chrome that lets you quickly locate text on any webpage. It supports multiple search modes and customizations:

- **Standard Search:** Find and highlight occurrences of a term.
- **Regex Search:** Use regular expressions to search for complex patterns.
- **Proximity Search:** Highlight areas where two terms appear near each other (in either order) within a specified word gap.
- **Sidebar Mode:** Optionally display search controls and results in a right-hand sidebar.
- **Navigation:** Easily jump to the next or previous match.
- **Custom Settings:** Configure highlight colors, display mode, and more.

## Installation

1. **Clone or download the repository.**
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select the project folder.
5. The extension will install and be ready to use.

## How to Use Advanced Find

### Standard Search Mode

1. **Open the Popup:** Click the Advanced Find icon to launch the search popup.
2. **Enter a Search Term:** Type the term into the **Search term** input field.
3. **Configure Options:**  
   - **Case Sensitive:** Toggle to match the case exactly.
   - **Whole Words:** Toggle to match only entire words.
4. **Search:** Click the **Search** button to highlight all occurrences on the page.
5. **Navigate:** Use the **Next Match** and **Previous Match** buttons to scroll to each highlighted occurrence.
6. **Clear Highlights:** Click the **Clear** button to remove all highlights.

### Regex Search Mode

1. **Activate Regex Mode:** Check the **Regex Mode** box to switch interfaces.
2. **Enter a Pattern:** Type your regular expression into the input field.
3. **Select Options:** Choose from preset regex options (e.g., Numbers, Email Addresses, URLs, Words) if desired.
4. **Search:** Click the **Search** button to highlight matches.
5. **Navigate:** Use the **Regex Next** and **Regex Previous** buttons to navigate.
6. **Help:** Click the **Regex Help** button for a brief explanation of regex syntax.
7. **Clear:** Click **Clear** to remove regex highlights.

### Proximity Search Mode

1. **Enable Proximity Search:** Check the **Enable Proximity Search** option to reveal additional controls.
2. **Enter Terms:**  
   - **First Search Term:** Enter the first term.
   - **Second Search Term:** Enter the second term.
3. **Set Maximum Words Between:** Define how many words can separate the two terms.
4. **Search:** Click the **Search Proximity** button to highlight the entire region spanning both terms.  
   *The tool automatically checks in both directions (before and after the first term).*

### Sidebar Mode

1. **Switch Display Mode:** Open the **Settings Panel** (click the settings icon) and select **Sidebar** under Display Mode.
2. **Toggle Sidebar:**  
   - Right-click on the page and select **Advanced Find on this page** to toggle the sidebar.
   - Alternatively, use the settings panel to open or close the sidebar.
3. **Use Sidebar Controls:** The sidebar contains the same search controls and navigation buttons as the popup.

### Settings Panel

1. **Open Settings:** Click the settings icon (gear) in the popup.
2. **Customize Appearance and Behavior:**
   - **Highlight Color:** Choose a custom color or click **Restore Default**.
   - **Display Mode:** Choose between **Popup** or **Sidebar**.
   - **Ignore Diacritics:** Toggle to ignore diacritical marks in searches.
   - **Animation Speed:** Adjust how fast highlights appear/disappear.
3. **Changes are saved automatically.**

### Additional Features

- **Tick Marks:** Small markers are shown along the right edge of the page to indicate the location of each match.
- **Context Menu:** Right-click anywhere on a webpage and select **Advanced Find on this page** to toggle the sidebar view.

## Troubleshooting

- **No Matches Found:**  
  - Double-check your search term and options (case sensitivity, whole words, regex).
- **Proximity Search Issues:**  
  - Ensure both search terms are entered and that the maximum word count is adequate.
- **Complex Pages (e.g., Reddit):**  
  - Some modern sites use frameworks (like React) that may affect highlighting. If you encounter issues, try using the sidebar mode or regex search mode.
- **Reloading the Extension:**  
  - If the extension stops working as expected, try reloading it from `chrome://extensions/` and refreshing the page.


---

Thank you for using Advanced Find!
