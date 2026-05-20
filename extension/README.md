# QuickAI Shorts — Chrome Extension Guide

This extension adds a **✦ QuickAI Short** action button directly into the YouTube player metadata area. Clicking the button instantly opens the QuickAI Shorts Editor at `quickaishort.online/editor` with the current video pre-loaded and ready for viral analysis using Google Gemini AI.

---

## 📂 Extension File Structure

Ensure the following files are present in the folder before zipping or loading:
```text
extension/
├── manifest.json       # Metadata & permissions config
├── background.js       # Background service worker (monitors installs/updates)
├── content.js          # Main content script injecting the YouTube action button
├── README.md           # This instructions guide
└── assets/
    ├── icon16.png      # 16x16 icon for extension tray
    ├── icon48.png      # 48x48 icon for extensions management page
    └── icon128.png     # 128x128 icon for Chrome Web Store listing
```

---

## 🛠️ Step 1: Testing the Extension Locally (Unpacked)

Before uploading to the Chrome Web Store, verify the extension behaves correctly on your machine:

1. Open your Google Chrome browser.
2. In the URL address bar, navigate to: `chrome://extensions/`.
3. In the top-right corner of the page, toggle **Developer mode** to **ON**.
4. In the top-left corner, click **Load unpacked**.
5. Select the **`extension`** folder from this project directory.
6. Open any YouTube watch video (e.g., `https://www.youtube.com/watch?v=dQw4w9WgXcQ`).
7. You should see a purple **✦ QuickAI Short** button appear on the metadata line (next to the Share/Download/Clip actions).
8. Click it to verify it correctly opens `https://www.quickaishort.online/editor?v=dQw4w9WgXcQ` in a new tab and automatically loads the video stream for analysis.

---

## 📦 Step 2: Packaging the Extension for the Web Store

Chrome Web Store accepts submissions in a `.zip` archive:

1. Compress the contents of the `extension` folder.
2. **CRITICAL:** Do NOT zip the parent `extension/` folder itself. Zip the **contents** of the folder directly, so `manifest.json` is at the root of the ZIP file.
3. Make sure to exclude `README.md` and any system/OS-generated files (e.g., `.DS_Store` or `Thumbs.db`) if present.

---

## 🚀 Step 3: Developer Dashboard Submission Guide

Follow these steps to publish your extension live to the public:

### 1. Log in to the Developer Console
- Navigate to the [Chrome Web Store Developer Console](https://chrome.google.com/webstore/devconsole).
- Log in using your Google Developer Account.
- *Note:* If you are registering a brand-new developer account, Google charges a one-time **$5 USD** fee to prevent spam.

### 2. Upload the Package
- Click the **+ New Item** button in the top right.
- Drag and drop your packaged `.zip` file.
- The console will automatically extract your `manifest.json` metadata.

### 3. Copy-Paste Store Listing Metadata
Here is the pre-composed, high-converting copy optimized for search (SEO) and user conversion:

*   **Item Title (Max 45 chars):**
    ```text
    QuickAI Shorts — Video to Shorts Generator
    ```

*   **Summary / Short Description (Max 150 chars):**
    ```text
    Generate viral vertical shorts from YouTube videos in seconds using Gemini AI. One-click editor launch directly from YouTube watch pages.
    ```

*   **Detailed Description:**
    ```text
    Turn any YouTube video into high-engagement, viral vertical shorts in a single click.

    The QuickAI Shorts Chrome Extension integrates directly into YouTube, placing a quick-access "✦ QuickAI Short" button right next to the video actions bar.

    FEATURES:
    ✦ One-Click Launch: Bypass manual URL copying. Click the button to instantly send the video to the QuickAI Editor.
    ✦ Intelligent Clip Selection: Leverage Google Gemini AI to analyze speech density, energy, and trends to select the most viral segments.
    ✦ "Pre-Flight" Audience Simulation: Simulate how GenZ, Millennial, Tech, Sports, and News audiences will react to your clip before publishing.
    ✦ Subtitles & Captions: Automatically transcribe and style beautiful, animated, high-retention subtitles.
    ✦ Rich Media Canvas: Re-position, split, resize, and edit video layout natively in your browser.

    HOW IT WORKS:
    1. Install this extension.
    2. Go to any YouTube watch page.
    3. Click the purple "✦ QuickAI Short" button.
    4. The editor will open in a new tab and begin processing the video automatically.

    QuickAI Short: OpusClip shows you which clip. Pre-Flight shows you if it will work.
    ```

*   **Category:** `Productivity` or `Social & Communication`
*   **Support & Privacy Links:**
    - Privacy Policy: `https://www.quickaishort.online/privacy`
    - Terms of Service: `https://www.quickaishort.online/terms`

### 4. Provide Permission Declarations (Important for Fast Approval)
Because the extension requests `host_permissions` on `*://*.youtube.com/*`, Google reviewers will ask why:
*   **Justification:**
    ```text
    The extension injects a launching button ('✦ QuickAI Short') into the DOM of the YouTube watch metadata container, allowing users to send the video URL of the current watch page directly to the editor for automated clip generation.
    ```

### 5. Upload Assets
- **Icons:** You can upload your high-resolution logo, or use `assets/icon128.png` included in this folder.
- **Screenshots:** Take 1-2 screenshots of:
  1. The purple button appearing on a YouTube video.
  2. The QuickAI Shorts editor loaded with the video.
  - *Dimensions:* 1280x800 or 640x400 pixels (PNG or JPEG).

### 6. Publish
- Click **Submit for Review**.
- Standard review times for Manifest V3 extension submissions are between **24 to 72 hours**. Once approved, your extension will go live!
