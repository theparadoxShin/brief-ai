# Brief AI

A Chrome extension for AI-powered text processing using Chrome's built-in Gemini Nano. Summarize, translate, proofread, and chat with AI directly in your browser.

## Features

**Standard Mode**
- Summarize: Quick summaries with multiple formats (TL;DR, Key Points, Teaser, Headline)
- Translate: Real-time translation with streaming support
- Proofread: Fix spelling and grammar errors
- AI Chat: Conversational AI with image description support

**Workers Mode** (Beta)
- Live Stream Translation: Real-time caption translation for YouTube, Netflix, Twitch

## Requirements

Chrome 138+ with the following flags enabled:

```
chrome://flags/#optimization-guide-on-device-model → Enabled
chrome://flags/#prompt-api-for-gemini-nano-multimodal-input → Enabled
chrome://flags/#proofreader-api-for-gemini-nano → Enabled
chrome://flags/#summarization-api-for-gemini-nano → Enabled
chrome://flags/#translation-api-without-language-pack → Enabled
```

After enabling flags, restart Chrome and wait for Gemini Nano to download (check `chrome://components` for "Optimization Guide On Device Model").

## Installation

1. Clone or download this repository
2. Open `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the project folder

## Usage

**Context Menu**
- Select text on any webpage
- Right-click and choose:
  - Summarize Selection
  - Translate Selection
  - Fix Spelling & Grammar
  - Ask AI about this
- Right-click on an image: "Describe this Image"

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
    // ...
};
```

4. The extension will automatically use `prefer_on_device` mode

See `services/firebase-ai-logic.js` for implementation details.

## Project Structure

```
brief-ai/
├── manifest.json          # Extension manifest
├── background.js          # Service worker
├── content.js             # Content script for live translation
├── config/
│   └── firebase-config.js # Firebase configuration
├── services/
│   ├── ai-services.js     # Main AI service
│   ├── proofreader-service.js
│   ├── firebase-ai-logic.js
│   └── ...
├── sidepanel/
│   ├── sidepanel-new.html
│   ├── sidepanel-new.js
│   └── sidepanel.css
└── icons/
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

Contributions are welcome. Please open an issue first to discuss what you would like to change.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/new-feature`)
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## License

MIT

## Author

Created by [Parfait Tedom Tedom](https://parfaittedomtedom.com)

## Acknowledgments

- Chrome Built-in AI APIs (Gemini Nano)
- Firebase AI Logic for hybrid inference
