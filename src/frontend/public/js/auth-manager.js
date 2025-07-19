// File: src/frontend/public/js/auth-manager.js
// Authentication manager for handling login, registration, and Google OAuth

class AuthManager {
    constructor() {
        this.sessionId = localStorage.getItem('sessionId');
        this.currentUser = null;
        this.init();
    }

    async init() {

        this.handleUrlParams();

        // Load Google Identity Services if configured
        if (window.GOOGLE_CLIENT_ID && window.GOOGLE_CLIENT_ID !== 'YOUR_GOOGLE_CLIENT_ID') {
            this.loadGoogleIdentityServices();
        }

        // Check if user is already authenticated
        await this.checkAuthStatus();

        // Set up event listeners (this will also render Google buttons)
        this.setupEventListeners();
    }

    loadGoogleIdentityServices() {
        if (!window.google) {
            const script = document.createElement('script');
            script.src = 'https://accounts.google.com/gsi/client';
            script.async = true;
            script.defer = true;
            script.onload = () => {
                this.initializeGoogleAuth();
                // Re-render buttons after Google services load
                setTimeout(() => this.renderGoogleButtons(), 100);
            };
            document.head.appendChild(script);
        } else {
            this.initializeGoogleAuth();
            this.renderGoogleButtons();
        }
    }

    initializeGoogleAuth() {
        console.log('Initializing Google Auth with client ID:', window.GOOGLE_CLIENT_ID);

        if (window.google && window.google.accounts && window.GOOGLE_CLIENT_ID) {
            try {
                window.google.accounts.id.initialize({
                    client_id: window.GOOGLE_CLIENT_ID,
                    callback: (response) => {
                        console.log('Google auth callback triggered:', response);
                        this.handleGoogleAuth(response);
                    }
                    // Remove the auto_select and cancel_on_tap_outside options
                });

                console.log('Google Identity Services initialized successfully');
            } catch (error) {
                console.error('Google auth initialization failed:', error);
            }
        } else {
            console.log('Google services not ready:', {
                google: !!window.google,
                accounts: !!(window.google && window.google.accounts),
                clientId: !!window.GOOGLE_CLIENT_ID
            });
        }
    }

    setupEventListeners() {
        // Login form
        const loginForm = document.getElementById('login-form');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => this.handleLogin(e));
        }

        // Registration form
        const registerForm = document.getElementById('register-form');
        if (registerForm) {
            registerForm.addEventListener('submit', (e) => this.handleRegister(e));
        }

        // Render Google buttons after initialization
        this.renderGoogleButtons();
    }

    renderGoogleButtons() {
        const googleLoginSimple = document.getElementById('google-login-simple');
        if (googleLoginSimple) {
            googleLoginSimple.addEventListener('click', () => {
                console.log('Simple Google login clicked');
                window.google.accounts.id.prompt();
            });
        }
    }

    async checkAuthStatus() {
        if (!this.sessionId) {
            this.showNotAuthenticated();
            return;
        }

        try {
            const response = await fetch('/api/auth/me', {
                headers: {
                    'X-Session-ID': this.sessionId
                }
            });

            if (response.ok) {
                this.currentUser = await response.json();
                this.showAuthenticated(this.currentUser);
            } else {
                // Session invalid, clear it
                localStorage.removeItem('sessionId');
                this.sessionId = null;
                this.showNotAuthenticated();
            }
        } catch (error) {
            console.error('Auth check failed:', error);
            this.showNotAuthenticated();
        }
    }

    async handleLogin(event) {
        event.preventDefault();

        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;

        this.hideError('login-error');

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (response.ok) {
                this.sessionId = data.sessionId;
                localStorage.setItem('sessionId', this.sessionId);
                this.currentUser = data.user;

                this.showAuthenticated(this.currentUser);
                this.closeModal('login-modal');

                // Show success message
                this.showSuccessMessage('Welcome back!');

                // Clear form
                document.getElementById('login-form').reset();
            } else {
                this.showError('login-error', data.error || 'Login failed');
            }
        } catch (error) {
            console.error('Login error:', error);
            this.showError('login-error', 'Network error. Please try again.');
        }
    }

    async handleRegister(event) {
        event.preventDefault();

        const username = document.getElementById('register-username').value;
        const email = document.getElementById('register-email').value;
        const password = document.getElementById('register-password').value;
        const confirmPassword = document.getElementById('register-confirm-password').value;
        const displayName = document.getElementById('register-display-name').value;

        this.hideError('register-error');

        // Client-side validation
        if (password !== confirmPassword) {
            this.showError('register-error', 'Passwords do not match');
            return;
        }

        if (password.length < 6) {
            this.showError('register-error', 'Password must be at least 6 characters long');
            return;
        }

        try {
            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, email, password, displayName })
            });

            const data = await response.json();

            if (response.ok) {
                this.sessionId = data.sessionId;
                localStorage.setItem('sessionId', this.sessionId);
                this.currentUser = data.user;

                this.showAuthenticated(this.currentUser);
                this.closeModal('register-modal');

                // Show success message
                this.showSuccessMessage('Account created successfully!');

                // Clear form
                document.getElementById('register-form').reset();
            } else {
                this.showError('register-error', data.error || 'Registration failed');
            }
        } catch (error) {
            console.error('Registration error:', error);
            this.showError('register-error', 'Network error. Please try again.');
        }
    }

    handleUrlParams() {
        const urlParams = new URLSearchParams(window.location.search);
        const loginStatus = urlParams.get('login');
        const sessionId = urlParams.get('sessionId');
        const provider = urlParams.get('provider');
        const error = urlParams.get('error');

        if (loginStatus === 'success' && sessionId) {
            console.log('Google OAuth success, storing session...');
            localStorage.setItem('sessionId', sessionId);
            this.sessionId = sessionId;

            // Check auth status to update UI
            this.checkAuthStatus();

            // Show success message
            const providerText = provider === 'google' ? 'Google' : '';
            this.showSuccessMessage(`Welcome! Logged in with ${providerText}`);

            // Clean up URL
            window.history.replaceState({}, document.title, window.location.pathname);
        } else if (error) {
            let errorMessage = 'Login failed';
            if (error === 'google_auth_failed') {
                errorMessage = 'Google authentication failed';
            }
            this.showError('login-error', errorMessage);

            // Clean up URL
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }

    async handleGoogleAuth(response) {
        console.log('=== Google Auth Callback Triggered ===');
        console.log('Response received:', response);

        if (!response || !response.credential) {
            console.error('No credential in Google response:', response);
            this.showError('login-error', 'Google authentication failed - no credential received');
            return;
        }

        console.log('Sending credential to server...');

        try {
            const result = await fetch('/api/auth/google', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ token: response.credential })
            });

            console.log('Server response status:', result.status);
            const data = await result.json();
            console.log('Server response data:', data);

            if (result.ok) {
                this.sessionId = data.sessionId;
                localStorage.setItem('sessionId', this.sessionId);
                this.currentUser = data.user;

                this.showAuthenticated(this.currentUser);
                this.closeModal('login-modal');
                this.closeModal('register-modal');

                // Show success message
                this.showSuccessMessage('Welcome!');
            } else {
                this.showError('login-error', data.error || 'Google authentication failed');
            }
        } catch (error) {
            console.error('Google auth error:', error);
            this.showError('login-error', 'Google authentication failed - network error');
        }
    }

    async logout() {
        try {
            if (this.sessionId) {
                await fetch('/api/auth/logout', {
                    method: 'POST',
                    headers: {
                        'X-Session-ID': this.sessionId
                    }
                });
            }
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            // Clear local data regardless of API result
            localStorage.removeItem('sessionId');
            this.sessionId = null;
            this.currentUser = null;
            this.showNotAuthenticated();
            this.showSuccessMessage('Logged out successfully');
        }
    }

    showAuthenticated(user) {
        const loggedInElement = document.getElementById('auth-logged-in');
        const notLoggedInElement = document.getElementById('auth-not-logged-in');

        if (loggedInElement && notLoggedInElement) {
            loggedInElement.classList.remove('hidden');
            notLoggedInElement.classList.add('hidden');

            // Update user info in the UI
            const avatarElement = document.getElementById('user-avatar');
            const displayNameElement = document.getElementById('user-display-name');
            const emailElement = document.getElementById('user-email');

            if (avatarElement && user.profilePicture) {
                avatarElement.src = user.profilePicture;
            }
            if (displayNameElement) {
                displayNameElement.textContent = user.displayName || user.username;
            }
            if (emailElement) {
                emailElement.textContent = user.email;
            }
        }
    }

    showNotAuthenticated() {
        const loggedInElement = document.getElementById('auth-logged-in');
        const notLoggedInElement = document.getElementById('auth-not-logged-in');

        if (loggedInElement && notLoggedInElement) {
            loggedInElement.classList.add('hidden');
            notLoggedInElement.classList.remove('hidden');
        }
    }

    showError(elementId, message) {
        const errorElement = document.getElementById(elementId);
        const messageElement = document.getElementById(elementId + '-message');

        if (errorElement && messageElement) {
            messageElement.textContent = message;
            errorElement.classList.remove('hidden');
        }
    }

    hideError(elementId) {
        const errorElement = document.getElementById(elementId);
        if (errorElement) {
            errorElement.classList.add('hidden');
        }
    }

    showSuccessMessage(message) {
        // Create a temporary success notification
        const notification = document.createElement('div');
        notification.className = 'alert alert-success fixed top-4 right-4 w-auto z-50';
        notification.innerHTML = `
            <svg class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <span>${message}</span>
        `;

        document.body.appendChild(notification);

        // Remove after 3 seconds
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('modal-open');
        }
    }

    openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('modal-open');
        }
    }
}

// Global functions for modal management and logout
function showLoginModal() {
    if (window.authManager) {
        window.authManager.closeModal('register-modal');
        window.authManager.openModal('login-modal');
    }
}

function showRegisterModal() {
    if (window.authManager) {
        window.authManager.closeModal('login-modal');
        window.authManager.openModal('register-modal');
    }
}

function logout() {
    if (window.authManager) {
        window.authManager.logout();
    }
}

// Initialize auth manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.authManager = new AuthManager();
});