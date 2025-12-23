# Chrome PDF Editor Extension

A feature-rich Google Chrome extension for viewing, editing, and annotating PDF documents directly in your browser.

## Features

### 📄 core PDF Operations
- **Open & View**: Load any PDF file from your local machine.
- **Save & Export**: Download your annotated PDF with all changes baked in.
- **Share**: Quickly share your edited document using the native Web Share API.

### ✏️ Annotation Tools
- **Pen Tool**: Freehand drawing for signatures or notes.
    - *Customizable Color*
    - *Adjustable Brush Size* (Numeric input)
- **Line Tool**: Draw perfectly straight lines for underlining or diagrams.
- **Highlighter**: Transparent marker for emphasizing important text.
- **Text Tool**: Click anywhere to type and add text labels.
- **Image Insertion**: Embed images (JPG, PNG) directly onto PDF pages.
- **Eraser**: Click on any annotation to remove it.
- **Undo/Redo**: Full history support to safely revert or re-apply changes.

### 🔄 Page Management
- **Rotate Page**: Rotate the current page 90 degrees clockwise.
- **Rotate All**: Rotate the entire document 90 degrees clockwise.
- **Navigation**: Jump directly to any page number using the input field.

### 👓 Viewing Experience
- **Auto Scroll**: Hands-free reading.
    - *Adjustable Speed*: Precise number input (1-100).
    - *Direction Control*: Scroll Up or Down.
- **Eye Comfort Mode**: Toggles a soothing overlay color to reduce eye strain during long reading sessions.
    - *Customizable Overlay Color*
- **Fullscreen**: Switch to immersive mode for distraction-free reading.

### 📝 Productivity
- **Integrated Notes**: A dedicated sidebar for keeping personal notes.
    - *Auto-Save*: Notes are automatically saved to your browser's local storage.
    - *File-Specific*: Notes are unique to each opened PDF file, ensuring your thoughts don't get mixed up.

## Installation

1.  Clone or download this repository.
2.  Open Chrome and navigate to `chrome://extensions/`.
3.  Enable **"Developer mode"** in the top-right corner.
4.  Click **"Load unpacked"**.
5.  Select the directory containing this extension.
6.  The PDF Editor icon should now appear in your browser toolbar.

## Technologies Used

- **HTML5 / CSS3**: Core UI and styling.
- **JavaScript (ES6+)**: Application logic.
- **PDF.js**: Rendering PDF documents in the browser.
- **Fabric.js**: Handling the interactive annotation layer (canvas).
- **jsPDF**: Generating the final PDF file for export.
