# Brief AI

A powerful Chrome extension that enhances your browsing experience with AI-powered tools. Choose between **Local AI** (Chrome's built-in Gemini Nano) or **Online AI** (Google Vertex AI) for maximum flexibility.

## Features

### Core Features
- **Smart Summarization**: Quickly summarize any text with multiple options (TL;DR, Key Points, Teaser, Headline)
- **Real-time Translation**: Translate text instantly with streaming support
- **AI Chat**: Have conversations with AI that remembers context
- **Context Menu Integration**: Right-click selected text for instant AI actions

### Hybrid AI Mode (NEW!)
- **Local AI Mode**: Use Chrome's built-in Gemini Nano (privacy-focused, no internet required)
- **Online AI Mode**: Connect to Google Vertex AI for more powerful models
  - Gemini 1.5 Pro
  - Gemini 1.5 Flash
  - Gemini Pro
- **Seamless Switching**: Toggle between modes instantly
- **Persistent Configuration**: Your settings are saved automatically

## Installation

### From Chrome Web Store
Coming soon!

### Manual Installation (Developer Mode)
1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top-right)
4. Click "Load unpacked"
5. Select the `brief-ai` folder
6. The extension is now installed!

## Usage

### Basic Usage
1. Select text on any web page
2. Right-click to open context menu
3. Choose an action:
   - **Summarize Selection**: Get a concise summary
   - **Translate Selection**: Translate to another language
   - **Ask AI about this**: Start a conversation with AI

### Using Local AI (Gemini Nano)
1. Open the Brief AI side panel
2. Select **Local AI** mode in the header
3. Use any AI feature - it runs directly in your browser
4. No internet connection required (after initial model download)

### Using Online AI (Vertex AI)
1. Click **Online AI** mode in the header
2. Click **Connect** button
3. On the authentication page, enter:
   - Your Google Cloud Project ID
   - Region/Location
   - API Key
4. Click **Test Connection** to verify
5. Click **Save Configuration**
6. Select your preferred model (Gemini 1.5 Pro, Flash, or Pro)
7. All AI features now use Vertex AI!

### Getting Google Vertex AI Credentials
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing one
3. Enable the **Vertex AI API**
4. Go to **APIs & Services > Credentials**
5. Create an API key
6. Copy the key and use it in Brief AI

## Roadmap

- [x] Summarizer with multiple types (TL;DR, Key Points, Teaser, Headline)
- [x] Real-time streaming translation
- [x] AI Chat with conversation memory
- [x] Context menu integration
- [x] **Hybrid AI Mode (Local + Online)**
- [x] Google Vertex AI integration
- [ ] Support for more AI providers (OpenAI, Anthropic Claude)
- [ ] Custom system prompts
- [ ] Export conversation history
- [ ] Multi-language UI

## Tech Stack

- **Chrome Extensions** (Manifest V3)
- **Chrome Built-in AI APIs**
  - Summarizer API
  - Translator API
  - Language Detector API
  - Prompt API (Gemini Nano)
- **Google Vertex AI**
  - Gemini 1.5 Pro
  - Gemini 1.5 Flash
  - Gemini Pro
- **JavaScript** (ES6+ Modules)
- **CSS3** (Custom Design System)

## Privacy & Security

### Local AI Mode
- All processing happens on your device
- No data sent to external servers
- Complete privacy

### Online AI Mode
- API key stored securely in Chrome's local storage
- Keys never shared with third parties
- You control your Google Cloud project
- Direct communication with Google Vertex AI only

## Version History

### v1.0.1 (Current)
- Added Hybrid AI Mode (Local/Online)
- Google Vertex AI integration
- Model selection (Gemini 1.5 Pro, Flash, Pro)
- Authentication page for API configuration
- Improved status indicators
- Enhanced UI with professional icons

### v1.0.0
- Initial release
- Basic summarization
- Translation support
- AI Chat
- Context menu integration

## License

Free to use - Version 1.0.1

© 2024 Brief AI - All rights reserved

## Support

For issues, questions, or feature requests, please open an issue on GitHub.
