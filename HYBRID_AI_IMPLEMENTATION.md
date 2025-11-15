# Hybrid AI System - Implementation Guide

## 🎯 Objectif

Créer un système intelligent qui peut basculer automatiquement entre :
- **On-Device AI** (Chrome Built-In APIs avec Gemini Nano) - Rapide, privé, gratuit
- **Cloud AI** (Firebase + Gemini API / OpenAI) - Plus puissant, nécessite connexion

## 📋 Architecture Hybrid AI

```
┌─────────────────────────────────────────────────────────────┐
│                      User Interface                          │
│                     (Side Panel)                             │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                  AI Router / Orchestrator                    │
│  - Détecte disponibilité on-device vs cloud                 │
│  - Gère les fallbacks intelligents                          │
│  - Cache les résultats                                       │
│  - Optimise les performances                                 │
└──────────┬───────────────────────────────────┬──────────────┘
           │                                   │
           ▼                                   ▼
┌──────────────────────┐          ┌──────────────────────────┐
│   On-Device AI       │          │      Cloud AI            │
│   (Gemini Nano)      │          │   (Firebase Functions)   │
│                      │          │                          │
│ - Summarizer         │          │ - Gemini Pro API         │
│ - Translator         │          │ - OpenAI (optional)      │
│ - Language Detector  │          │ - Claude (optional)      │
│ - Prompt API         │          │                          │
│                      │          │ - Plus puissant          │
│ ✅ Rapide            │          │ ✅ Capacités avancées    │
│ ✅ Privé             │          │ ✅ Toujours disponible   │
│ ✅ Gratuit           │          │ ⚠️ Coûts API             │
│ ✅ Offline           │          │ ⚠️ Nécessite Internet    │
│ ⚠️ Limité            │          │                          │
└──────────────────────┘          └──────────────────────────┘
```

## 🔧 Étapes d'implémentation

### Phase 1 : Infrastructure Firebase

#### 1.1 Setup Firebase Project

```bash
# Installation Firebase CLI
npm install -g firebase-tools

# Login
firebase login

# Initialize project
firebase init
```

**Services nécessaires :**
- Firebase Authentication (pour gérer les utilisateurs)
- Cloud Functions (pour les appels API backend)
- Firestore (pour stocker historique et préférences)
- Firebase Storage (pour cache cloud optionnel)

#### 1.2 Structure Firebase

```
firebase/
├── functions/
│   ├── index.js              # Entry point
│   ├── ai-services/
│   │   ├── gemini.js         # Google Gemini API
│   │   ├── openai.js         # OpenAI API (optional)
│   │   └── claude.js         # Anthropic Claude (optional)
│   ├── middleware/
│   │   ├── auth.js           # Authentication
│   │   ├── rateLimit.js      # Rate limiting
│   │   └── cache.js          # Caching logic
│   └── utils/
│       ├── logger.js
│       └── errorHandler.js
├── firestore.rules           # Security rules
└── storage.rules             # Storage rules
```

#### 1.3 Environment Variables

```javascript
// .env (NE PAS COMMIT)
GEMINI_API_KEY=your_gemini_api_key
OPENAI_API_KEY=your_openai_api_key (optional)
ANTHROPIC_API_KEY=your_anthropic_api_key (optional)
FIREBASE_PROJECT_ID=your_project_id
```

### Phase 2 : AI Router Service

#### 2.1 Créer le Router

```javascript
// services/ai-router.js

export class AIRouter {
    constructor() {
        this.onDeviceService = new AIService();
        this.cloudService = new CloudAIService();
        this.cache = new CacheService();
    }

    async route(request) {
        const { action, text, options, preferOnDevice = true } = request;
        
        // 1. Check cache first
        const cachedResult = await this.cache.get(request);
        if (cachedResult) return cachedResult;
        
        // 2. Determine best provider
        const provider = await this.selectProvider(action, text, preferOnDevice);
        
        // 3. Execute with fallback
        try {
            let result;
            
            if (provider === 'on-device') {
                result = await this.executeOnDevice(action, text, options);
            } else {
                result = await this.executeCloud(action, text, options);
            }
            
            // Cache successful result
            await this.cache.set(request, result);
            return result;
            
        } catch (error) {
            // Fallback strategy
            return await this.handleFallback(action, text, options, provider);
        }
    }

    async selectProvider(action, text, preferOnDevice) {
        // Check on-device availability
        const onDeviceAvailable = await this.onDeviceService.isAvailable(action);
        
        // Check text length (on-device has limits)
        const textLength = text.length;
        const ON_DEVICE_MAX_LENGTH = 10000; // Example limit
        
        // Decision logic
        if (preferOnDevice && onDeviceAvailable && textLength < ON_DEVICE_MAX_LENGTH) {
            return 'on-device';
        }
        
        // Check network connectivity
        const isOnline = navigator.onLine;
        if (!isOnline && onDeviceAvailable) {
            return 'on-device';
        }
        
        // Default to cloud if available
        return this.cloudService.isAvailable() ? 'cloud' : 'on-device';
    }

    async handleFallback(action, text, options, failedProvider) {
        console.warn(`${failedProvider} failed, attempting fallback`);
        
        const alternateProvider = failedProvider === 'on-device' ? 'cloud' : 'on-device';
        
        if (alternateProvider === 'on-device') {
            return await this.executeOnDevice(action, text, options);
        } else {
            return await this.executeCloud(action, text, options);
        }
    }

    async executeOnDevice(action, text, options) {
        switch (action) {
            case 'summarize':
                return await this.onDeviceService.summarize(text, options);
            case 'translate':
                return await this.onDeviceService.translate(text, options.targetLang);
            case 'detect':
                return await this.onDeviceService.detectLanguage(text);
            case 'prompt':
                return await this.onDeviceService.prompt(text, options.context);
            default:
                throw new Error(`Unknown action: ${action}`);
        }
    }

    async executeCloud(action, text, options) {
        // Call Firebase Cloud Function
        const response = await fetch('https://your-firebase-function-url', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${await this.getAuthToken()}`
            },
            body: JSON.stringify({ action, text, options })
        });
        
        if (!response.ok) {
            throw new Error('Cloud AI request failed');
        }
        
        return await response.json();
    }

    async getAuthToken() {
        // Get Firebase auth token
        const user = firebase.auth().currentUser;
        if (user) {
            return await user.getIdToken();
        }
        return null;
    }
}
```

### Phase 3 : Cloud Functions

#### 3.1 Gemini Cloud Function

```javascript
// firebase/functions/ai-services/gemini.js

const { GoogleGenerativeAI } = require('@google/generative-ai');

class GeminiService {
    constructor() {
        this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        this.model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });
    }

    async summarize(text, options = {}) {
        const prompt = `Summarize the following text in a ${options.length || 'medium'} length, ${options.type || 'tl;dr'} style:\n\n${text}`;
        
        const result = await this.model.generateContent(prompt);
        const response = await result.response;
        
        return {
            summary: response.text(),
            originalLength: text.length,
            summaryLength: response.text().length,
            provider: 'gemini-cloud'
        };
    }

    async translate(text, targetLang, sourceLang = 'auto') {
        const prompt = `Translate the following text from ${sourceLang} to ${targetLang}:\n\n${text}`;
        
        const result = await this.model.generateContent(prompt);
        const response = await result.response;
        
        return {
            translatedText: response.text(),
            sourceLanguage: sourceLang,
            targetLanguage: targetLang,
            provider: 'gemini-cloud'
        };
    }

    async chat(message, context = null) {
        const chat = this.model.startChat({
            history: context ? this.parseContext(context) : [],
        });
        
        const result = await chat.sendMessage(message);
        const response = await result.response;
        
        return {
            response: response.text(),
            provider: 'gemini-cloud'
        };
    }

    parseContext(context) {
        // Convert context to Gemini history format
        return context.map(msg => ({
            role: msg.role,
            parts: [{ text: msg.content }]
        }));
    }
}

module.exports = GeminiService;
```

#### 3.2 Main Cloud Function

```javascript
// firebase/functions/index.js

const functions = require('firebase-functions');
const GeminiService = require('./ai-services/gemini');
const rateLimit = require('./middleware/rateLimit');
const authenticate = require('./middleware/auth');

const gemini = new GeminiService();

exports.processAI = functions
    .region('us-central1')
    .https
    .onCall(async (data, context) => {
        // Authenticate user
        if (!context.auth) {
            throw new functions.https.HttpsError(
                'unauthenticated',
                'User must be authenticated'
            );
        }

        // Rate limiting
        await rateLimit.check(context.auth.uid);

        const { action, text, options } = data;

        try {
            let result;
            
            switch (action) {
                case 'summarize':
                    result = await gemini.summarize(text, options);
                    break;
                case 'translate':
                    result = await gemini.translate(text, options.targetLang, options.sourceLang);
                    break;
                case 'prompt':
                    result = await gemini.chat(text, options.context);
                    break;
                default:
                    throw new Error('Unknown action');
            }

            // Log usage
            await logUsage(context.auth.uid, action, text.length);

            return { success: true, data: result };

        } catch (error) {
            console.error('Cloud AI error:', error);
            throw new functions.https.HttpsError('internal', error.message);
        }
    });

async function logUsage(userId, action, textLength) {
    const admin = require('firebase-admin');
    await admin.firestore().collection('usage').add({
        userId,
        action,
        textLength,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
}
```

### Phase 4 : Cache Service

```javascript
// services/cache-service.js

export class CacheService {
    constructor() {
        this.maxAge = 24 * 60 * 60 * 1000; // 24 hours
        this.maxSize = 100;
    }

    async get(request) {
        const key = this.generateKey(request);
        const cached = await chrome.storage.local.get(key);
        
        if (cached[key]) {
            const item = cached[key];
            
            // Check if expired
            if (Date.now() - item.timestamp < this.maxAge) {
                return item.data;
            } else {
                // Remove expired item
                await chrome.storage.local.remove(key);
            }
        }
        
        return null;
    }

    async set(request, data) {
        const key = this.generateKey(request);
        
        await chrome.storage.local.set({
            [key]: {
                data,
                timestamp: Date.now()
            }
        });
        
        // Cleanup old entries
        await this.cleanup();
    }

    generateKey(request) {
        const { action, text } = request;
        // Create hash of request (simplified)
        return `cache_${action}_${this.simpleHash(text)}`;
    }

    simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(36);
    }

    async cleanup() {
        const allData = await chrome.storage.local.get(null);
        const cacheKeys = Object.keys(allData).filter(k => k.startsWith('cache_'));
        
        if (cacheKeys.length > this.maxSize) {
            // Sort by timestamp and remove oldest
            const sorted = cacheKeys
                .map(key => ({ key, timestamp: allData[key].timestamp }))
                .sort((a, b) => a.timestamp - b.timestamp);
            
            const toRemove = sorted.slice(0, cacheKeys.length - this.maxSize);
            await chrome.storage.local.remove(toRemove.map(item => item.key));
        }
    }
}
```

### Phase 5 : User Preferences UI

```javascript
// sidepanel/settings.html & settings.js

// Add settings tab to side panel
<div class="settings-section">
    <h3>AI Provider Preferences</h3>
    
    <div class="setting-item">
        <label>
            <input type="radio" name="provider" value="on-device" checked>
            On-Device (Recommended)
            <span class="help-text">Fast, private, works offline</span>
        </label>
    </div>
    
    <div class="setting-item">
        <label>
            <input type="radio" name="provider" value="cloud">
            Cloud AI
            <span class="help-text">More powerful, requires internet</span>
        </label>
    </div>
    
    <div class="setting-item">
        <label>
            <input type="radio" name="provider" value="hybrid">
            Hybrid (Smart)
            <span class="help-text">Automatically choose best option</span>
        </label>
    </div>
    
    <div class="setting-item">
        <label>
            <input type="checkbox" name="enableCache" checked>
            Enable cache (faster repeat requests)
        </label>
    </div>
</div>
```

## 📊 Métriques à tracker

### Analytics Firebase

```javascript
// Track usage patterns
- Action type (summarize, translate, detect, chat)
- Provider used (on-device vs cloud)
- Response time
- Text length
- Success/failure rate
- Fallback frequency
```

### Dashboard suggéré

```
┌─────────────────────────────────────────┐
│   Brief AI - Usage Dashboard             │
├─────────────────────────────────────────┤
│                                          │
│  Total Requests Today:      1,234        │
│  On-Device:                 85%          │
│  Cloud:                     15%          │
│                                          │
│  Avg Response Time:         350ms        │
│  Cache Hit Rate:            65%          │
│  Fallback Rate:             2%           │
│                                          │
│  Most Used Feature:         Summarize    │
│  Success Rate:              98.5%        │
│                                          │
└─────────────────────────────────────────┘
```

## 💰 Cost Estimation

### On-Device (Current)
- Cost: **$0** (100% gratuit)
- Limits: Capacité du modèle local

### Cloud (Future)

#### Gemini API Pricing (approximatif)
- Input: ~$0.00025 per 1K characters
- Output: ~$0.0005 per 1K characters

#### Example costs pour 1000 utilisateurs/jour:
- Avg 10 requests/user/day = 10,000 requests
- Avg 1000 chars input + 500 chars output
- Cost: ~$7.50/day = ~$225/month

#### Optimisations pour réduire coûts:
1. **Cache agressif** (réduction ~60%)
2. **On-device par défaut** (réduction ~80%)
3. **Rate limiting**
4. **Batch requests** quand possible

## 🔐 Sécurité

### Firestore Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // User preferences
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Usage logs
    match /usage/{logId} {
      allow read: if request.auth != null && request.auth.uid == resource.data.userId;
      allow create: if request.auth != null;
    }
    
    // Public stats (aggregated)
    match /stats/{statId} {
      allow read: if true;
      allow write: if false; // Only admins via Functions
    }
  }
}
```

## 🎯 KPIs de succès

1. **Performance**
   - On-device response time < 500ms
   - Cloud response time < 2s
   - Cache hit rate > 60%

2. **Fiabilité**
   - Success rate > 98%
   - Fallback rate < 5%
   - Uptime > 99.9%

3. **Cost Efficiency**
   - On-device usage > 80%
   - Monthly cloud costs < $100 pour 1000 users

4. **User Satisfaction**
   - Feature usage growth > 20%/month
   - Positive feedback > 80%

## 📝 Checklist Implementation

- [ ] Setup Firebase project
- [ ] Configure authentication
- [ ] Implement Cloud Functions
- [ ] Create AI Router service
- [ ] Add Cache service
- [ ] Implement fallback logic
- [ ] Add user preferences UI
- [ ] Setup analytics
- [ ] Write security rules
- [ ] Load testing
- [ ] Cost monitoring
- [ ] Documentation
- [ ] Beta testing

---

**Next Steps:** Commencer par Phase 1 - Setup Firebase ! 🚀
