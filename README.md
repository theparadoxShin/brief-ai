# Brief AI

A minimal Chrome extension that intelligently summarizes selected text on any web page, built for the Google Built‑In AI Challenge 2025.

## 🏆 Hackathon Context

Project created for the Google Built‑In AI Challenge, exploring Chrome’s built‑in AI capabilities.

## ✨ Features

- Summarize Selection: Right‑click selected text → "Summarize Selection"
- Built‑in AI: Designed to use Chrome native AI APIs
- Text‑to‑Speech: The summary can be spoken aloud
- Works Everywhere: Runs on any web page

## ✅ Roadmap / Tasks to Validate

- [x] Summarizer via context menu on selected text, with on‑page toast and TTS playback
- [ ] Prompt API: Add a context‑menu entry to run custom prompts on selection (free‑form input)
- [ ] Translator API: Allow choosing target language; summary + speech output in that language; integrate with summarizer
- [ ] Rewriter API: Improve questions or prompts found on websites (rewrite for clarity and quality)

## 🚀 Installation

1. Clone the repo
2. Open Chrome → Extensions → Enable Developer mode
3. Load unpacked → select this project folder

## 🎯 Usage

1. Select text on any page
2. Right‑click → "Summarize Selection"
3. The AI returns a concise summary
4. The summary is optionally read out loud

## 🛠️ Tech

- Chrome Extensions (Manifest V3)
- Chrome Built‑in AI APIs (planned integration)
- JavaScript (ES6+)
