# Brief AI - Firebase Setup

## Prerequisites

1. Install Firebase CLI:
```bash
npm install -g firebase-tools
```

2. Login to Firebase:
```bash
firebase login
```

## Setup Steps

### 1. Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project: "brief-ai-production"
3. Enable Google Analytics (recommended)

### 2. Initialize Firebase

```bash
# In the project root directory
firebase init
```

Select the following:
- ✅ Firestore
- ✅ Functions
- ✅ Hosting

### 3. Enable Vertex AI

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your Firebase project
3. Enable **Vertex AI API**
4. The Project ID will be automatically used in Cloud Functions

### 4. Install Dependencies

```bash
cd firebase/functions
npm install
```

### 5. Deploy Functions

```bash
# Deploy all functions
firebase deploy --only functions

# Or deploy specific function
firebase deploy --only functions:summarizeText
```

## Environment Variables

Firebase Cloud Functions automatically have access to:
- `process.env.GCLOUD_PROJECT` - Your project ID
- Firebase Admin SDK credentials

No manual API key configuration needed!

## Available Functions

### 1. summarizeText
```javascript
const result = await firebase.functions().httpsCallable('summarizeText')({
  text: "Your text here",
  type: "tldr",      // or "key-points", "teaser", "headline"
  length: "medium"   // or "short", "long"
});
```

### 2. translateText
```javascript
const result = await firebase.functions().httpsCallable('translateText')({
  text: "Hello world",
  targetLanguage: "fr",
  sourceLanguage: "en"  // optional, default: "auto"
});
```

### 3. chatWithAI
```javascript
const result = await firebase.functions().httpsCallable('chatWithAI')({
  message: "What is the weather like?",
  context: [
    { role: "user", content: "Hi!" },
    { role: "assistant", content: "Hello! How can I help?" }
  ]
});
```

### 4. getUserInfo
```javascript
const result = await firebase.functions().httpsCallable('getUserInfo')();
// Returns: { subscription, requestsToday, remaining, limit }
```

## Rate Limits

- **Free**: 50 requests/day
- **Pro**: Unlimited requests
- **Team**: Unlimited requests

## Firestore Collections

### `/users/{userId}`
```javascript
{
  subscription: "free" | "pro" | "team",
  requestsToday: 0,
  lastReset: Timestamp,
  createdAt: Timestamp
}
```

### `/usage/{logId}`
```javascript
{
  userId: string,
  action: "summarize" | "translate" | "chat",
  inputLength: number,
  outputLength: number,
  model: string,
  timestamp: Timestamp
}
```

### `/conversations/{userId}/messages/{messageId}`
```javascript
{
  role: "user" | "assistant",
  content: string,
  timestamp: Timestamp
}
```

## Testing Locally

Start Firebase Emulators:
```bash
firebase emulators:start
```

This will run:
- Functions: http://localhost:5001
- Firestore: http://localhost:8080
- Auth: http://localhost:9099

## Monitoring

View function logs:
```bash
firebase functions:log
```

View real-time logs:
```bash
firebase functions:log --follow
```

## Cost Estimation

### Vertex AI (Gemini) Pricing
- **Input**: ~$0.00025 per 1K characters
- **Output**: ~$0.0005 per 1K characters

### Example Monthly Cost (1000 active users)
- Average: 10 requests/user/day
- Average input: 1000 chars
- Average output: 500 chars
- **Estimated**: ~$225/month

### Cost Optimization Tips
1. Use `gemini-1.5-flash` for free tier (cheaper)
2. Use `gemini-1.5-pro` for pro tier (more powerful)
3. Implement aggressive caching
4. Rate limit to prevent abuse

## Security

- All functions require authentication
- Firestore rules enforce user data isolation
- Rate limiting prevents abuse
- Usage tracking for monitoring

## Troubleshooting

### Function deployment fails
```bash
# Check Node version (must be 18)
node --version

# Clear cache and reinstall
cd firebase/functions
rm -rf node_modules package-lock.json
npm install
```

### Authentication errors
- Make sure Firebase Auth is enabled in Console
- Check that user is signed in before calling functions

### Rate limit errors
- Check user's subscription in Firestore
- Verify daily reset logic is working

## Support

For issues:
1. Check Cloud Functions logs
2. Review Firestore security rules
3. Test with Firebase Emulators
4. Contact support@briefai.com
