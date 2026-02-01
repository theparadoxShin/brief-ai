/**
 * Brief AI - Landing Page & Authentication
 * Handles Firebase Auth, Pricing, and Payment flow
 */

import { firebaseConfig } from '../config/firebase-config.js';

// ===== Firebase Initialization (CDN approach for simplicity) =====
// Note: In production, you would use npm packages
let auth = null;
let db = null;

// Check if we're in extension context or web context
const isExtension = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;

// ===== DOM Elements =====
const loginBtn = document.getElementById('loginBtn');
const getStartedBtn = document.getElementById('getStartedBtn');
const authModal = document.getElementById('authModal');
const closeModal = document.getElementById('closeModal');
const authContainer = document.getElementById('authContainer');

// ===== Initialize =====
document.addEventListener('DOMContentLoaded', () => {
    initUI();
    checkAuthState();
});

function initUI() {
    // Login button
    loginBtn?.addEventListener('click', () => showAuthModal());
    
    // Get Started button
    getStartedBtn?.addEventListener('click', () => showAuthModal());
    
    // Close modal
    closeModal?.addEventListener('click', () => hideAuthModal());
    
    // Close modal on outside click
    authModal?.addEventListener('click', (e) => {
        if (e.target === authModal) hideAuthModal();
    });
    
    // Pricing buttons
    document.querySelectorAll('[data-plan]').forEach(btn => {
        btn.addEventListener('click', () => {
            const plan = btn.dataset.plan;
            handlePlanSelection(plan);
        });
    });

    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });
}

// ===== Auth Modal =====
function showAuthModal() {
    if (authModal) {
        authModal.style.display = 'flex';
        renderAuthForm();
    }
}

function hideAuthModal() {
    if (authModal) {
        authModal.style.display = 'none';
    }
}

function renderAuthForm() {
    if (!authContainer) return;
    
    authContainer.innerHTML = `
        <div class="auth-form">
            <div class="auth-header">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
                <h2>Sign in to Brief AI</h2>
                <p>Access Cloud AI features and sync across devices</p>
            </div>
            
            <div class="auth-tabs">
                <button class="auth-tab active" data-tab="signin">Sign In</button>
                <button class="auth-tab" data-tab="signup">Sign Up</button>
            </div>
            
            <form id="emailAuthForm" class="auth-form-fields">
                <div class="form-group">
                    <label for="authEmail">Email</label>
                    <input type="email" id="authEmail" placeholder="your@email.com" required>
                </div>
                <div class="form-group">
                    <label for="authPassword">Password</label>
                    <input type="password" id="authPassword" placeholder="••••••••" required minlength="6">
                </div>
                <div class="form-group signup-only" style="display: none;">
                    <label for="authName">Display Name</label>
                    <input type="text" id="authName" placeholder="Your name">
                </div>
                <button type="submit" class="btn btn-primary btn-full" id="emailAuthBtn">
                    Sign In
                </button>
            </form>
            
            <div class="auth-divider">
                <span>or continue with</span>
            </div>
            
            <div class="social-auth">
                <button class="btn-social" id="googleAuthBtn">
                    <svg width="20" height="20" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    Google
                </button>
            </div>
            
            <div class="auth-status" id="authStatus"></div>
            
            <p class="auth-footer">
                By continuing, you agree to our <a href="#">Terms of Service</a> and <a href="#">Privacy Policy</a>
            </p>
        </div>
    `;
    
    // Setup auth form listeners
    setupAuthFormListeners();
}

function setupAuthFormListeners() {
    const tabs = document.querySelectorAll('.auth-tab');
    const form = document.getElementById('emailAuthForm');
    const signupFields = document.querySelector('.signup-only');
    const submitBtn = document.getElementById('emailAuthBtn');
    const googleBtn = document.getElementById('googleAuthBtn');
    
    let isSignUp = false;
    
    // Tab switching
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            isSignUp = tab.dataset.tab === 'signup';
            if (signupFields) {
                signupFields.style.display = isSignUp ? 'block' : 'none';
            }
            if (submitBtn) {
                submitBtn.textContent = isSignUp ? 'Create Account' : 'Sign In';
            }
        });
    });
    
    // Email/Password auth
    form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('authEmail')?.value;
        const password = document.getElementById('authPassword')?.value;
        const name = document.getElementById('authName')?.value;
        
        showAuthStatus('Processing...', 'info');
        
        if (isSignUp) {
            await handleSignUp(email, password, name);
        } else {
            await handleSignIn(email, password);
        }
    });
    
    // Google auth
    googleBtn?.addEventListener('click', () => handleGoogleAuth());
}

// ===== Auth Handlers =====
async function handleSignIn(email, password) {
    try {
        // For demo/development - simulate auth
        // In production, use Firebase Auth
        const user = {
            email: email,
            displayName: email.split('@')[0],
            uid: 'demo_' + Date.now(),
            photoURL: null
        };
        
        await saveUserAuth(user, 'free');
        showAuthStatus('Signed in successfully!', 'success');
        
        setTimeout(() => {
            hideAuthModal();
            updateUIForLoggedInUser(user);
        }, 1000);
        
    } catch (error) {
        showAuthStatus('Sign in failed: ' + error.message, 'error');
    }
}

async function handleSignUp(email, password, name) {
    try {
        const user = {
            email: email,
            displayName: name || email.split('@')[0],
            uid: 'demo_' + Date.now(),
            photoURL: null
        };
        
        await saveUserAuth(user, 'free');
        showAuthStatus('Account created successfully!', 'success');
        
        setTimeout(() => {
            hideAuthModal();
            updateUIForLoggedInUser(user);
        }, 1000);
        
    } catch (error) {
        showAuthStatus('Sign up failed: ' + error.message, 'error');
    }
}

async function handleGoogleAuth() {
    showAuthStatus('Google Sign In...', 'info');
    
    try {
        // For demo - simulate Google auth
        const user = {
            email: 'user@gmail.com',
            displayName: 'Google User',
            uid: 'google_' + Date.now(),
            photoURL: 'https://www.gravatar.com/avatar/demo?d=mp'
        };
        
        await saveUserAuth(user, 'free');
        showAuthStatus('Signed in with Google!', 'success');
        
        setTimeout(() => {
            hideAuthModal();
            updateUIForLoggedInUser(user);
        }, 1000);
        
    } catch (error) {
        showAuthStatus('Google sign in failed: ' + error.message, 'error');
    }
}

async function saveUserAuth(user, plan = 'free') {
    const authData = {
        isAuthenticated: true,
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        plan: plan,
        timestamp: Date.now()
    };
    
    // Save to localStorage (works in both web and extension context)
    localStorage.setItem('briefai_auth', JSON.stringify(authData));
    
    // If in extension context, also save to chrome.storage
    if (isExtension) {
        try {
            await chrome.storage.local.set({ userAuth: authData });
        } catch (e) {
            console.warn('Could not save to chrome.storage:', e);
        }
    }
    
    return authData;
}

async function checkAuthState() {
    try {
        // Check localStorage first
        const stored = localStorage.getItem('briefai_auth');
        if (stored) {
            const auth = JSON.parse(stored);
            if (auth.isAuthenticated) {
                updateUIForLoggedInUser(auth);
                return;
            }
        }
        
        // Check chrome.storage if in extension
        if (isExtension) {
            const result = await chrome.storage.local.get(['userAuth']);
            if (result.userAuth?.isAuthenticated) {
                updateUIForLoggedInUser(result.userAuth);
            }
        }
    } catch (e) {
        console.warn('Error checking auth state:', e);
    }
}

function updateUIForLoggedInUser(user) {
    if (loginBtn) {
        loginBtn.textContent = user.displayName || user.email;
        loginBtn.onclick = showUserMenu;
    }
}

function showUserMenu() {
    // Simple logout for now
    if (confirm('Do you want to sign out?')) {
        handleLogout();
    }
}

async function handleLogout() {
    localStorage.removeItem('briefai_auth');
    
    if (isExtension) {
        try {
            await chrome.storage.local.remove(['userAuth']);
        } catch (e) {
            console.warn('Could not clear chrome.storage:', e);
        }
    }
    
    if (loginBtn) {
        loginBtn.textContent = 'Sign In';
        loginBtn.onclick = showAuthModal;
    }
    
    location.reload();
}

// ===== Plan Selection =====
async function handlePlanSelection(plan) {
    // Check if user is logged in
    const stored = localStorage.getItem('briefai_auth');
    
    if (!stored || !JSON.parse(stored).isAuthenticated) {
        showAuthModal();
        return;
    }
    
    // Show payment modal/redirect to Stripe
    showPaymentFlow(plan);
}

function showPaymentFlow(plan) {
    const prices = {
        pro: { amount: 5, name: 'Pro' },
        premium: { amount: 19, name: 'Premium' }
    };
    
    const planInfo = prices[plan];
    if (!planInfo) return;
    
    // For demo - show a simple payment modal
    // In production, integrate with Stripe
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="modal-content">
            <button class="modal-close" onclick="this.closest('.modal').remove()">&times;</button>
            <div class="payment-form">
                <h2>Upgrade to ${planInfo.name}</h2>
                <p class="price-display">$${planInfo.amount}/month</p>
                
                <div class="payment-notice">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="16" x2="12" y2="12"></line>
                        <line x1="12" y1="8" x2="12.01" y2="8"></line>
                    </svg>
                    <p>Payment integration coming soon! For now, enjoy all features for free during beta.</p>
                </div>
                
                <button class="btn btn-primary btn-full" onclick="this.closest('.modal').remove(); alert('Thank you! Premium features activated for beta testing.');">
                    Activate Beta Access
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

// ===== Utilities =====
function showAuthStatus(message, type) {
    const status = document.getElementById('authStatus');
    if (status) {
        status.textContent = message;
        status.className = `auth-status ${type}`;
        status.style.display = 'block';
    }
}

// Add modal and auth styles
const style = document.createElement('style');
style.textContent = `
.modal {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: none;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 20px;
}

.modal-content {
    background: white;
    border-radius: 16px;
    padding: 32px;
    max-width: 420px;
    width: 100%;
    position: relative;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
}

.modal-close {
    position: absolute;
    top: 16px;
    right: 16px;
    background: none;
    border: none;
    font-size: 24px;
    cursor: pointer;
    color: #64748b;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
}

.modal-close:hover {
    background: #f1f5f9;
}

.auth-form {
    display: flex;
    flex-direction: column;
    gap: 20px;
}

.auth-header {
    text-align: center;
}

.auth-header h2 {
    margin: 16px 0 8px;
    font-size: 24px;
}

.auth-header p {
    color: #64748b;
    font-size: 14px;
}

.auth-tabs {
    display: flex;
    gap: 8px;
    padding: 4px;
    background: #f1f5f9;
    border-radius: 10px;
}

.auth-tab {
    flex: 1;
    padding: 10px;
    border: none;
    background: transparent;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 500;
    color: #64748b;
    transition: all 0.2s;
}

.auth-tab.active {
    background: white;
    color: #0f172a;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.auth-form-fields {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.form-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.form-group label {
    font-size: 13px;
    font-weight: 500;
    color: #374151;
}

.form-group input {
    padding: 12px 14px;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    font-size: 14px;
}

.form-group input:focus {
    outline: none;
    border-color: #6366f1;
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
}

.btn-full {
    width: 100%;
    padding: 14px;
}

.auth-divider {
    display: flex;
    align-items: center;
    gap: 16px;
    color: #94a3b8;
    font-size: 13px;
}

.auth-divider::before,
.auth-divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: #e2e8f0;
}

.social-auth {
    display: flex;
    gap: 12px;
}

.btn-social {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 12px;
    border: 1px solid #e2e8f0;
    background: white;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 500;
    transition: all 0.2s;
}

.btn-social:hover {
    background: #f8fafc;
    border-color: #cbd5e1;
}

.auth-status {
    padding: 12px;
    border-radius: 8px;
    font-size: 13px;
    text-align: center;
    display: none;
}

.auth-status.info {
    background: #eff6ff;
    color: #1d4ed8;
}

.auth-status.success {
    background: #f0fdf4;
    color: #15803d;
}

.auth-status.error {
    background: #fef2f2;
    color: #dc2626;
}

.auth-footer {
    text-align: center;
    font-size: 12px;
    color: #94a3b8;
}

.auth-footer a {
    color: #6366f1;
    text-decoration: none;
}

.payment-form {
    text-align: center;
}

.payment-form h2 {
    margin-bottom: 8px;
}

.price-display {
    font-size: 32px;
    font-weight: 700;
    color: #6366f1;
    margin-bottom: 24px;
}

.payment-notice {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 16px;
    background: #eff6ff;
    border-radius: 12px;
    text-align: left;
    margin-bottom: 20px;
}

.payment-notice svg {
    flex-shrink: 0;
    color: #3b82f6;
}

.payment-notice p {
    font-size: 13px;
    color: #1e40af;
    margin: 0;
}
`;
document.head.appendChild(style);
