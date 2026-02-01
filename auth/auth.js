// Brief AI - Authentication Page Script

class AuthManager {
    constructor() {
        this.init();
    }

    async init() {
        this.setupEventListeners();
        await this.loadCurrentConfig();
    }

    setupEventListeners() {
        // Form submission
        document.getElementById('authForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveConfiguration();
        });

        // Test connection
        document.getElementById('testConnection').addEventListener('click', () => {
            this.testConnection();
        });

        // Toggle API key visibility
        document.getElementById('toggleApiKey').addEventListener('click', () => {
            this.toggleApiKeyVisibility();
        });

        // Disconnect
        const disconnectBtn = document.getElementById('disconnectBtn');
        if (disconnectBtn) {
            disconnectBtn.addEventListener('click', () => {
                this.disconnect();
            });
        }
    }

    async loadCurrentConfig() {
        try {
            const result = await chrome.storage.local.get(['vertexAI']);

            if (result.vertexAI && result.vertexAI.apiKey) {
                // Show current configuration
                document.getElementById('currentConfig').style.display = 'block';
                document.getElementById('currentProjectId').textContent = result.vertexAI.projectId;
                document.getElementById('currentLocation').textContent = result.vertexAI.location;

                // Pre-fill form
                document.getElementById('projectId').value = result.vertexAI.projectId;
                document.getElementById('location').value = result.vertexAI.location;
                document.getElementById('apiKey').value = result.vertexAI.apiKey;
            }
        } catch (error) {
            console.error('Error loading configuration:', error);
        }
    }

    async saveConfiguration() {
        const projectId = document.getElementById('projectId').value.trim();
        const location = document.getElementById('location').value;
        const apiKey = document.getElementById('apiKey').value.trim();

        if (!projectId || !location || !apiKey) {
            this.showStatus('Please fill in all fields', 'error');
            return;
        }

        const saveBtn = document.getElementById('saveBtn');
        saveBtn.classList.add('loading');
        saveBtn.disabled = true;

        try {
            // Save configuration
            await chrome.storage.local.set({
                vertexAI: {
                    projectId,
                    location,
                    apiKey,
                    connected: true,
                    timestamp: Date.now()
                }
            });

            // Notify extension
            await chrome.runtime.sendMessage({
                action: 'VERTEX_AI_CONNECTED',
                config: { projectId, location }
            });

            this.showStatus('Configuration saved successfully!', 'success');

            // Reload current config display
            setTimeout(() => {
                this.loadCurrentConfig();
            }, 1000);

        } catch (error) {
            console.error('Error saving configuration:', error);
            this.showStatus('Failed to save configuration: ' + error.message, 'error');
        } finally {
            saveBtn.classList.remove('loading');
            saveBtn.disabled = false;
        }
    }

    async testConnection() {
        const projectId = document.getElementById('projectId').value.trim();
        const location = document.getElementById('location').value;
        const apiKey = document.getElementById('apiKey').value.trim();

        if (!projectId || !location || !apiKey) {
            this.showStatus('Please fill in all fields before testing', 'error');
            return;
        }

        const testBtn = document.getElementById('testConnection');
        testBtn.classList.add('loading');
        testBtn.disabled = true;

        try {
            // Test the connection
            const response = await this.makeVertexAIRequest(projectId, location, apiKey, 'Hello');

            if (response) {
                this.showStatus('Connection successful! API is working correctly.', 'success');
            } else {
                this.showStatus('Connection test failed. Please check your credentials.', 'error');
            }

        } catch (error) {
            console.error('Connection test error:', error);
            this.showStatus('Connection failed: ' + error.message, 'error');
        } finally {
            testBtn.classList.remove('loading');
            testBtn.disabled = false;
        }
    }

    async makeVertexAIRequest(projectId, location, apiKey, text) {
        const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/gemini-pro:generateContent`;

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                contents: [{
                    role: 'user',
                    parts: [{ text }]
                }],
                generationConfig: {
                    maxOutputTokens: 100,
                    temperature: 0.5
                }
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'API request failed');
        }

        return await response.json();
    }

    async disconnect() {
        if (!confirm('Are you sure you want to disconnect? This will remove your saved credentials.')) {
            return;
        }

        try {
            await chrome.storage.local.remove(['vertexAI']);

            // Notify extension
            await chrome.runtime.sendMessage({
                action: 'VERTEX_AI_DISCONNECTED'
            });

            this.showStatus('Disconnected successfully', 'success');

            // Reset form and hide current config
            document.getElementById('authForm').reset();
            document.getElementById('currentConfig').style.display = 'none';

        } catch (error) {
            console.error('Error disconnecting:', error);
            this.showStatus('Failed to disconnect: ' + error.message, 'error');
        }
    }

    toggleApiKeyVisibility() {
        const apiKeyInput = document.getElementById('apiKey');
        const toggleBtn = document.getElementById('toggleApiKey');

        if (apiKeyInput.type === 'password') {
            apiKeyInput.type = 'text';
            toggleBtn.innerHTML = `
                <svg class="eye-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                    <line x1="1" y1="1" x2="23" y2="23"></line>
                </svg>
            `;
        } else {
            apiKeyInput.type = 'password';
            toggleBtn.innerHTML = `
                <svg class="eye-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                </svg>
            `;
        }
    }

    showStatus(message, type = 'success') {
        const statusMessage = document.getElementById('statusMessage');
        const statusText = document.getElementById('statusText');

        statusText.textContent = message;
        statusMessage.className = `status-message ${type}`;
        statusMessage.style.display = 'flex';

        // Auto-hide after 5 seconds
        setTimeout(() => {
            statusMessage.style.display = 'none';
        }, 5000);
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new AuthManager();
});
