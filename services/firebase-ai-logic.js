/**
 * Firebase AI Logic Service - Hybrid AI Implementation
 * Uses Firebase AI Logic SDK for seamless fallback between on-device and cloud AI
 * 
 * Documentation: https://developer.chrome.com/docs/ai/firebase-ai-logic
 * 
 * Modes:
 * - 'prefer_on_device': Use local Gemini Nano when available, fallback to cloud
 * - 'prefer_in_cloud': Use cloud by default, fallback to local when offline
 * - 'only_on_device': Only use local Gemini Nano (no cloud fallback)
 * - 'only_in_cloud': Only use cloud (requires internet)
 */

// Firebase AI Logic wrapper for Brief AI
// This service provides a unified interface for hybrid AI inference

export class FirebaseAILogicService {
    constructor() {
        this.firebaseApp = null;
        this.googleAI = null;
        this.model = null;
        this.mode = 'prefer_on_device'; // Default: prefer local, fallback cloud
        this.selectedModel = 'gemini-1.5-flash'; // Default cloud model
        this.isInitialized = false;
        this.lastInferenceSource = null; // 'on_device' or 'cloud'
    }

    /**
     * Initialize Firebase and AI Logic
     * Call this after Firebase SDK is loaded
     */
    async initialize(firebaseConfig) {
        try {
            // Dynamic import of Firebase modules
            // In production, these would be bundled
            const { initializeApp, getApps } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js');
            const { getAI, getGenerativeModel } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-ai.js');

            // Initialize Firebase app (reuse if already initialized)
            if (getApps().length === 0) {
                this.firebaseApp = initializeApp(firebaseConfig);
            } else {
                this.firebaseApp = getApps()[0];
            }

            // Get AI service
            this.googleAI = getAI(this.firebaseApp);

            // Create generative model with hybrid mode
            this.model = getGenerativeModel(this.googleAI, {
                mode: this.mode,
                model: this.selectedModel // Used when falling back to cloud
            });

            this.isInitialized = true;
            console.log('[Firebase AI Logic] Initialized successfully with mode:', this.mode);

            return true;
        } catch (error) {
            console.error('[Firebase AI Logic] Initialization error:', error);
            this.isInitialized = false;
            return false;
        }
    }

    /**
     * Set the inference mode
     * @param {'prefer_on_device' | 'prefer_in_cloud' | 'only_on_device' | 'only_in_cloud'} mode
     */
    async setMode(mode) {
        const validModes = ['prefer_on_device', 'prefer_in_cloud', 'only_on_device', 'only_in_cloud'];
        if (!validModes.includes(mode)) {
            throw new Error(`Invalid mode. Must be one of: ${validModes.join(', ')}`);
        }

        this.mode = mode;

        // Recreate model with new mode if initialized
        if (this.isInitialized && this.googleAI) {
            const { getGenerativeModel } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-ai.js');
            this.model = getGenerativeModel(this.googleAI, {
                mode: this.mode,
                model: this.selectedModel
            });
        }

        // Save to storage
        await chrome.storage.local.set({ firebaseAIMode: mode });
        console.log('[Firebase AI Logic] Mode set to:', mode);
    }

    /**
     * Set the cloud model to use when falling back
     * @param {string} modelName - e.g., 'gemini-1.5-pro', 'gemini-1.5-flash'
     */
    async setCloudModel(modelName) {
        this.selectedModel = modelName;

        if (this.isInitialized && this.googleAI) {
            const { getGenerativeModel } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-ai.js');
            this.model = getGenerativeModel(this.googleAI, {
                mode: this.mode,
                model: this.selectedModel
            });
        }

        await chrome.storage.local.set({ firebaseAIModel: modelName });
        console.log('[Firebase AI Logic] Cloud model set to:', modelName);
    }

    /**
     * Generate content with text prompt
     * @param {string} prompt - Text prompt
     * @returns {Promise<{text: string, source: string}>}
     */
    async generateContent(prompt) {
        if (!this.isInitialized || !this.model) {
            throw new Error('Firebase AI Logic not initialized. Call initialize() first.');
        }

        try {
            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();

            // Determine inference source (this is a best-effort detection)
            this.lastInferenceSource = this.detectInferenceSource(response);

            return {
                text: text,
                source: this.lastInferenceSource,
                timestamp: Date.now()
            };
        } catch (error) {
            console.error('[Firebase AI Logic] Generate content error:', error);
            throw error;
        }
    }

    /**
     * Generate content with streaming
     * @param {string} prompt - Text prompt
     * @param {Function} onChunk - Callback for each chunk
     * @returns {Promise<{text: string, source: string}>}
     */
    async generateContentStream(prompt, onChunk) {
        if (!this.isInitialized || !this.model) {
            throw new Error('Firebase AI Logic not initialized. Call initialize() first.');
        }

        try {
            const result = await this.model.generateContentStream(prompt);
            let fullText = '';

            for await (const chunk of result.stream) {
                const chunkText = chunk.text();
                fullText += chunkText;
                if (onChunk) onChunk(fullText);
            }

            // Get complete response for metadata
            const response = await result.response;
            this.lastInferenceSource = this.detectInferenceSource(response);

            return {
                text: fullText,
                source: this.lastInferenceSource,
                timestamp: Date.now()
            };
        } catch (error) {
            console.error('[Firebase AI Logic] Streaming error:', error);
            throw error;
        }
    }

    /**
     * Generate content with multimodal input (text + image)
     * @param {string} prompt - Text prompt
     * @param {File|Blob} imageFile - Image file
     * @returns {Promise<{text: string, source: string}>}
     */
    async generateContentWithImage(prompt, imageFile) {
        if (!this.isInitialized || !this.model) {
            throw new Error('Firebase AI Logic not initialized. Call initialize() first.');
        }

        try {
            // Convert image to base64
            const imagePart = await this.fileToGenerativePart(imageFile);

            const result = await this.model.generateContent([prompt, imagePart]);
            const response = await result.response;
            const text = response.text();

            this.lastInferenceSource = this.detectInferenceSource(response);

            return {
                text: text,
                source: this.lastInferenceSource,
                timestamp: Date.now()
            };
        } catch (error) {
            console.error('[Firebase AI Logic] Multimodal error:', error);
            throw error;
        }
    }

    /**
     * Convert File/Blob to Firebase AI GenerativePart format
     */
    async fileToGenerativePart(file) {
        const base64EncodedDataPromise = new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.readAsDataURL(file);
        });

        return {
            inlineData: {
                data: await base64EncodedDataPromise,
                mimeType: file.type
            }
        };
    }

    /**
     * Detect if inference was on-device or cloud
     * Note: This is best-effort as the SDK doesn't explicitly expose this
     */
    detectInferenceSource(response) {
        // In the Firebase AI Logic implementation, when using prefer_on_device:
        // - If Gemini Nano is available, it runs locally
        // - Otherwise, it falls back to cloud
        // We can infer from mode and availability
        
        if (this.mode === 'only_in_cloud') return 'cloud';
        if (this.mode === 'only_on_device') return 'on_device';

        // For hybrid modes, check if we have the Prompt API available
        if (typeof LanguageModel !== 'undefined') {
            // If LanguageModel exists and mode prefers on-device, likely local
            if (this.mode === 'prefer_on_device') {
                return 'on_device';
            }
        }

        // Default assumption based on mode
        return this.mode === 'prefer_in_cloud' ? 'cloud' : 'on_device';
    }

    /**
     * Get current configuration
     */
    getConfig() {
        return {
            mode: this.mode,
            cloudModel: this.selectedModel,
            isInitialized: this.isInitialized,
            lastInferenceSource: this.lastInferenceSource
        };
    }

    /**
     * Load saved configuration from storage
     */
    async loadConfig() {
        const result = await chrome.storage.local.get(['firebaseAIMode', 'firebaseAIModel']);
        
        if (result.firebaseAIMode) {
            this.mode = result.firebaseAIMode;
        }
        if (result.firebaseAIModel) {
            this.selectedModel = result.firebaseAIModel;
        }

        return this.getConfig();
    }
}

// Export singleton instance
export const firebaseAILogic = new FirebaseAILogicService();

// Available cloud models for selection
export const AVAILABLE_CLOUD_MODELS = [
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', description: 'Fast and efficient' },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', description: 'Most capable' },
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', description: 'Latest fast model' }
];

// AI Mode options
export const AI_MODES = [
    { 
        id: 'prefer_on_device', 
        name: 'Hybrid (Local First)', 
        description: 'Use Gemini Nano locally, fallback to cloud if unavailable',
        icon: '🔒'
    },
    { 
        id: 'prefer_in_cloud', 
        name: 'Hybrid (Cloud First)', 
        description: 'Use cloud by default, use local when offline',
        icon: '☁️'
    },
    { 
        id: 'only_on_device', 
        name: 'Local Only', 
        description: 'Always use Gemini Nano (offline capable)',
        icon: '💻'
    },
    { 
        id: 'only_in_cloud', 
        name: 'Cloud Only', 
        description: 'Always use cloud models (requires internet)',
        icon: '🌐'
    }
];
