// Firebase Authentication Service
// Handles user authentication for Cloud AI access

import { firebaseConfig } from '../config/firebase-config.js';

class FirebaseAuthService {
    constructor() {
        this.auth = null;
        this.currentUser = null;
        this.initialized = false;
    }

    // Initialize Firebase (only once)
    async initialize() {
        if (this.initialized) return;

        try {
            // Import Firebase dynamically
            const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js');
            const { getAuth, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } =
                await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');

            // Initialize Firebase
            const app = initializeApp(firebaseConfig);
            this.auth = getAuth(app);
            this.GoogleAuthProvider = GoogleAuthProvider;
            this.signInWithPopup = signInWithPopup;
            this.signOut = signOut;

            // Listen for auth state changes
            onAuthStateChanged(this.auth, (user) => {
                this.currentUser = user;
                this.notifyAuthChange(user);
            });

            this.initialized = true;
            console.log('Firebase Auth initialized');

        } catch (error) {
            console.error('Firebase initialization error:', error);
            throw error;
        }
    }

    // Sign in with Google
    async signInWithGoogle() {
        await this.initialize();

        try {
            const provider = new this.GoogleAuthProvider();
            provider.addScope('email');
            provider.addScope('profile');

            const result = await this.signInWithPopup(this.auth, provider);
            const user = result.user;

            console.log('User signed in:', user.email);

            // Store user info in Chrome storage
            await chrome.storage.local.set({
                firebaseUser: {
                    uid: user.uid,
                    email: user.email,
                    displayName: user.displayName,
                    photoURL: user.photoURL,
                    signedInAt: Date.now()
                }
            });

            return user;

        } catch (error) {
            console.error('Sign in error:', error);
            throw error;
        }
    }

    // Sign out
    async signOutUser() {
        await this.initialize();

        try {
            await this.signOut(this.auth);
            await chrome.storage.local.remove(['firebaseUser']);
            console.log('User signed out');

        } catch (error) {
            console.error('Sign out error:', error);
            throw error;
        }
    }

    // Get current user
    async getCurrentUser() {
        await this.initialize();
        return this.currentUser;
    }

    // Get ID token for authenticated requests
    async getIdToken() {
        await this.initialize();

        if (!this.currentUser) {
            throw new Error('User not authenticated');
        }

        return await this.currentUser.getIdToken();
    }

    // Check if user is authenticated
    async isAuthenticated() {
        await this.initialize();
        return this.currentUser !== null;
    }

    // Get user info from storage (faster than Firebase)
    async getUserInfoFromStorage() {
        const result = await chrome.storage.local.get(['firebaseUser']);
        return result.firebaseUser || null;
    }

    // Notify listeners about auth state changes
    notifyAuthChange(user) {
        chrome.runtime.sendMessage({
            action: 'AUTH_STATE_CHANGED',
            user: user ? {
                uid: user.uid,
                email: user.email,
                displayName: user.displayName,
                photoURL: user.photoURL
            } : null
        }).catch(() => {
            // Ignore errors if no listeners
        });
    }
}

// Export singleton instance
export const firebaseAuth = new FirebaseAuthService();
