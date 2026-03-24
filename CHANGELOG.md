# Brief AI - Changelog

All notable changes to Brief AI will be documented in this file.

## [2.0.0] - 2026-02-01

### 🎉 Major Release - Brief AI v2

This release brings significant improvements to Brief AI, making it more powerful and user-friendly.

### ✨ New Features

#### Proofreader API Integration
- **New**: Added spelling and grammar checking using Chrome's built-in Proofreader API (Gemini Nano)
- **New**: Context menu option "✏️ Fix Spelling & Grammar" to proofread selected text
- **New**: Dedicated "Proofread" tab in the sidepanel with visual correction highlighting
- **New**: Multi-language support for proofreading (English, French, Spanish, German, Italian, Portuguese)

#### Enhanced Live Stream Translation
- **Fixed**: YouTube caption detection now works properly using MutationObserver on `.ytp-caption-segment`
- **Improved**: Platform-specific detection for YouTube, Netflix, Twitch, and generic HTML5 video
- **Improved**: Better debouncing for rapid caption changes
- **Improved**: Enhanced overlay styling with blur and shadow effects

#### Multimodal AI Support
- **New**: Image description via context menu ("🖼️ Describe this Image")
- **New**: Image upload in AI Chat for visual analysis
- **New**: Support for image drag-and-drop

#### Firebase AI Logic Integration
- **New**: Hybrid AI mode with `prefer_on_device` for optimal performance
- **New**: Automatic fallback from local (Gemini Nano) to cloud (Gemini Pro/Flash)
- **New**: Cloud model selector (Flash, Pro, 2.0 Flash)

### 🎨 UI/UX Improvements
- **Redesigned**: Modern, cleaner sidepanel interface
- **Improved**: Better visual feedback for AI operations
- **Improved**: Enhanced toast notifications
- **Added**: Real-time translation streaming with visual status
- **Added**: AI Chat streaming responses with typewriter effect

### 🔧 Technical Improvements
- **Optimized**: Summarizer now properly recreates session when options change
- **Fixed**: Memory leaks in live translation observer
- **Improved**: Error handling across all AI services
- **Updated**: Manifest description and version

### 📋 Context Menu Updates
- `📝 Summarize Selection` - Summarize selected text
- `🌍 Translate Selection` - Translate selected text
- `✏️ Fix Spelling & Grammar` - NEW! Proofread selected text
- `🤖 Ask AI about this` - Ask AI questions about selected text
- `🖼️ Describe this Image` - Describe right-clicked images

### ⚙️ Requirements
To use all features, enable these Chrome flags:
- `chrome://flags/#optimization-guide-on-device-model`
- `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input`
- `chrome://flags/#proofreader-api-for-gemini-nano`
- `chrome://flags/#summarization-api-for-gemini-nano`
- `chrome://flags/#translation-api-without-language-pack`

---

## [1.1.0] - Previous Version

### Features
- Basic summarization with Gemini Nano
- Translation with streaming
- AI Chat
- Live Stream translation (basic)

---

## [1.0.0] - Initial Release

### Features
- Text summarization
- Text translation
- Basic AI chat
- Context menu integration

---

## Roadmap (Coming in v2.x.x)

### v2.1.0 - Shopping Assistant
- Product analysis and comparison
- Price tracking
- Review summarization

### v2.2.0 - Study Assistant
- Auto-generated course notes
- Flashcard creation
- Quiz generation

### v2.3.0 - Enhanced Cloud Features
- More cloud AI models
- Sync across devices
- Custom prompt templates

---

Made with ❤️ by the Brief AI Team
