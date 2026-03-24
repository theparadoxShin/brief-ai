# Brief AI

A Chrome extension for AI-powered text processing using Chrome's built-in Gemini Nano. Summarize, translate, proofread, and chat with AI directly in your browser.

[![Sponsor](https://img.shields.io/badge/♥_Sponsor-theparadoxShin-e74c6f?style=flat-square)](https://github.com/sponsors/theparadoxShin)

## Features

**Standard Mode**
- 📝 **Summarize**: Quick summaries with multiple formats (TL;DR, Key Points, Teaser, Headline)
- 🌍 **Translate**: Real-time translation with streaming support
- ✏️ **Proofread**: Fix spelling and grammar errors using Chrome's Proofreader API
- 🤖 **AI Chat**: Conversational AI with image description support (multimodal)

**Workers Mode** (Beta)
- 🎬 **Live Stream Translation**: Real-time caption translation for YouTube, Netflix, Twitch

## Requirements

- **Chrome 138+** (required — the extension enforces this via `minimum_chrome_version`)
- The following Built-in AI APIs are used and available natively in Chrome 138+ for extensions:
  - **Prompt API** — Available in Chrome 138 stable for extensions
  - **Summarizer API** — Available in Chrome 138 stable
  - **Translator API** — Available in Chrome 138 stable
  - **Language Detector API** — Available in Chrome 138 stable
  - **Proofreader API** — Origin trial (may require enabling `chrome://flags/#proofreader-api-for-gemini-nano`)

### Hardware Requirements

- **Storage**: At least 22 GB free on the volume with your Chrome profile
- **GPU**: Strictly more than 4 GB of VRAM, **or** CPU with 16 GB+ RAM and 4+ cores
- **Network**: Unmetered connection (for initial model download)

> **Note**: Chrome automatically downloads Gemini Nano when the extension first uses a Built-in AI API. You can check the download status at `chrome://components` → "Optimization Guide On Device Model".

### For Local Development (localhost)

If testing on `localhost`, enable these flags manually:

```
chrome://flags/#optimization-guide-on-device-model → Enabled
chrome://flags/#prompt-api-for-gemini-nano-multimodal-input → Enabled
```

> ⚠️ These flags **cannot** be activated automatically by an extension — they are user-level browser settings. For published Chrome extensions on Chrome 138+, most APIs work without any flags.

## Installation

### From Chrome Web Store
*(Coming soon)*

### Manual (Developer Mode)
1. Clone or download this repository
2. Open `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the project folder

## Usage

**Context Menu**
- Select text on any webpage and right-click:
  - 📝 Summarize Selection
  - 🌍 Translate Selection
  - ✏️ Fix Spelling & Grammar
  - 🤖 Ask AI about this
- Right-click on an image: 🖼️ Describe this Image

**Side Panel**
- Click the Brief AI icon to open the side panel
- Switch between Standard and Workers modes
- Use the tabs to access different features

## Hybrid AI Mode (Firebase AI Logic)

Brief AI supports hybrid inference using Firebase AI Logic with the `prefer_on_device` mode:

1. Uses local Gemini Nano when available (privacy-focused, offline capable)
2. Falls back to cloud Gemini models when local AI is unavailable

To enable Firebase AI Logic:

1. Create a Firebase project at https://console.firebase.google.com
2. Enable the Generative Language API in Google Cloud Console
3. Update `config/firebase-config.js` with your credentials:

```javascript
export const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "your-project.firebaseapp.com",
    projectId: "your-project-id",
};
```

4. The extension will automatically use `prefer_on_device` mode

See `services/firebase-ai-logic.js` for implementation details.

## Project Structure

```
brief-ai/
├── manifest.json              # Extension manifest (MV3)
├── background.js              # Service worker
├── content.js                 # Content script for live translation
├── config/
│   └── firebase-config.js     # Firebase configuration
├── services/
│   ├── ai-services.js         # Core AI service (Summarizer, Translator, Prompt, etc.)
│   └── proofreader-service.js # Proofreader API wrapper
├── sidepanel/
│   ├── sidepanel-new.html     # Side panel UI
│   ├── sidepanel-new.js       # Side panel controller
│   └── sidepanel.css          # Styles
└── icons/
    ├── icon16.png
    ├── logo48.png
    └── logo128.png
```

## Roadmap

**v2.1.0 - Shopping Assistant**
- Product analysis and comparison
- Price tracking
- Review summarization

**v2.2.0 - Study Assistant**
- Auto-generated course notes
- Flashcard creation
- Quiz generation

**v2.3.0 - Enhanced Features**
- More language support
- Custom prompt templates
- Export conversation history
- Cross-device sync

## Contributing

**This project is open source and welcomes contributions from everyone!** Whether you're fixing a bug, adding a feature, improving documentation, or suggesting ideas — your help is appreciated.

### How to Contribute

1. **Fork** the repository
2. **Clone** your fork locally:
   ```bash
   git clone https://github.com/<your-username>/brief-ai.git
   ```
3. **Create a feature branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```
4. **Make your changes** and test them by loading the extension in `chrome://extensions/` (Developer mode → Load unpacked)
5. **Commit** your changes with a clear message:
   ```bash
   git commit -m "feat: add your feature description"
   ```
6. **Push** to your branch:
   ```bash
   git push origin feature/your-feature-name
   ```
7. **Open a Pull Request** on the main repository

### Contribution Guidelines

- **Open an issue first** to discuss significant changes before starting work
- Follow the existing code style and project structure
- Test your changes thoroughly with Chrome 138+
- Keep pull requests focused — one feature or fix per PR
- Update documentation if your changes affect usage

### Ideas for Contributions

- New AI features or workflows
- Support for additional streaming platforms (Workers mode)
- UI/UX improvements
- Bug fixes and performance improvements
- Translations and internationalization
- Documentation improvements

> **First time contributing to open source?** Check out [How to Contribute to Open Source](https://opensource.guide/how-to-contribute/) for a beginner-friendly guide.

## Support

If you find Brief AI useful, consider supporting the project:

[![Sponsor theparadoxShin](https://img.shields.io/badge/♥_Sponsor-GitHub_Sponsors-e74c6f?style=for-the-badge)](https://github.com/sponsors/theparadoxShin)

## License

MIT

## Author

Created by [Parfait Tedom Tedom](https://parfaittedomtedom.com)

## Acknowledgments

- [Chrome Built-in AI APIs](https://developer.chrome.com/docs/ai/built-in-apis) (Gemini Nano)
- [Firebase AI Logic](https://developer.chrome.com/docs/ai/firebase-ai-logic) for hybrid inference
