// File: src/frontend/public/js/auth-manager.js
// Authentication manager for handling login, registration, and Google OAuth

class AuthManager {
    constructor() {
        this.currentUser = null;
        this.init();
    }

    async init() {
        this.handleUrlParams();

        if (
            window.GOOGLE_CLIENT_ID &&
            window.GOOGLE_CLIENT_ID !== 'YOUR_GOOGLE_CLIENT_ID'
        ) {
            this.loadGoogleIdentityServices();
        }
        await this.checkAuthStatus();
        this.setupEventListeners();
        this.isReady = true;
        window.dispatchEvent(new CustomEvent('authManagerReady'));
    }

    async waitForReady(maxWaitTime = 5000) {
        if (this.isReady) {
            return true;
        }

        return new Promise(resolve => {
            const timeout = setTimeout(() => {
                console.warn('AuthManager took too long to initialize');
                resolve(false);
            }, maxWaitTime);

            const handleReady = () => {
                clearTimeout(timeout);
                window.removeEventListener('authManagerReady', handleReady);
                resolve(true);
            };

            window.addEventListener('authManagerReady', handleReady);
        });
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
        if (
            window.google &&
            window.google.accounts &&
            window.GOOGLE_CLIENT_ID
        ) {
            try {
                window.google.accounts.id.initialize({
                    client_id: window.GOOGLE_CLIENT_ID,
                    callback: response => {
                        console.log(
                            'Google auth callback triggered:',
                            response
                        );
                        this.handleGoogleAuth(response);
                    },
                });
            } catch (error) {
                console.error('Google auth initialization failed:', error);
            }
        } else {
            console.log('Google services not ready:', {
                google: !!window.google,
                accounts: !!(window.google && window.google.accounts),
                clientId: !!window.GOOGLE_CLIENT_ID,
            });
        }
    }

    setupEventListeners() {
        // Login form
        const loginForm = document.getElementById('login-form');
        if (loginForm) {
            loginForm.addEventListener('submit', e => this.handleLogin(e));
        }

        // Registration form
        const registerForm = document.getElementById('register-form');
        if (registerForm) {
            registerForm.addEventListener('submit', e =>
                this.handleRegister(e)
            );
        }

        // Render Google buttons after initialization
        this.renderGoogleButtons();
    }

    renderGoogleButtons() {
        const googleLoginSimple = document.getElementById(
            'google-login-simple'
        );
        if (googleLoginSimple) {
            googleLoginSimple.addEventListener('click', () => {
                console.log('Simple Google login clicked');
                window.google.accounts.id.prompt();
            });
        }
    }

    async checkAuthStatus() {
        try {
            const response = await fetch('/api/auth/me', {
                credentials: 'include',
            });

            if (response.ok) {
                this.currentUser = await response.json();
                this.showAuthenticated(this.currentUser);
            } else {
                this.deleteCookie('loginProvider');
                this.deleteCookie('userPrefs');
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
        const rememberMe =
            document.getElementById('remember-me')?.checked || false;

        this.hideError('login-error');

        try {
            const csrfToken = await this.getCsrfToken();
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken,
                },
                body: JSON.stringify({ email, password, rememberMe }),
            });

            const data = await response.json();

            if (response.ok) {
                this.setCookie('loginProvider', 'email', rememberMe ? 30 : 7);
                this.setCookie('rememberMe', rememberMe.toString(), 365);

                // Store user preferences if available
                if (data.user.preferences) {
                    this.setCookie(
                        'userPrefs',
                        JSON.stringify(data.user.preferences),
                        30
                    );
                }

                this.currentUser = data.user;
                this.showAuthenticated(this.currentUser);
                this.closeModal('login-modal');
                this.showSuccessMessage('Welcome back!');
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
        const confirmPassword = document.getElementById(
            'register-confirm-password'
        ).value;
        const displayName = document.getElementById(
            'register-display-name'
        ).value;

        this.hideError('register-error');

        // Client-side validation
        if (password !== confirmPassword) {
            this.showError('register-error', 'Passwords do not match');
            return;
        }

        if (password.length < 6) {
            this.showError(
                'register-error',
                'Password must be at least 6 characters long'
            );
            return;
        }

        try {
            const csrfToken = await this.getCsrfToken();
            const response = await fetch('/api/auth/register', {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken,
                },
                body: JSON.stringify({
                    username,
                    email,
                    password,
                    displayName,
                }),
            });

            const data = await response.json();

            if (response.ok) {
                this.setCookie('loginProvider', 'email', 7);
                this.setCookie('isNewUser', 'true', 1); // Expires in 1 day

                this.currentUser = data.user;
                this.showAuthenticated(this.currentUser);
                this.closeModal('register-modal');
                this.showSuccessMessage('Account created successfully!');
                document.getElementById('register-form').reset();
            } else {
                this.showError(
                    'register-error',
                    data.error || 'Registration failed'
                );
            }
        } catch (error) {
            console.error('Registration error:', error);
            this.showError(
                'register-error',
                'Network error. Please try again.'
            );
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
            window.history.replaceState(
                {},
                document.title,
                window.location.pathname
            );
        } else if (error) {
            let errorMessage = 'Login failed';
            if (error === 'google_auth_failed') {
                errorMessage = 'Google authentication failed';
            }
            this.showError('login-error', errorMessage);

            // Clean up URL
            window.history.replaceState(
                {},
                document.title,
                window.location.pathname
            );
        }
    }

    async handleGoogleAuth(response) {
        console.log('=== Google Auth Callback Triggered ===');

        if (!response || !response.credential) {
            console.error('No credential in Google response:', response);
            this.showError(
                'login-error',
                'Google authentication failed - no credential received'
            );
            return;
        }

        try {
            const result = await fetch('/api/auth/google', {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ token: response.credential }),
            });

            const data = await result.json();

            if (result.ok) {
                this.setCookie('loginProvider', 'google', 30);
                this.currentUser = data.user;
                this.showAuthenticated(this.currentUser);
                this.closeModal('login-modal');
                this.closeModal('register-modal');
                this.showSuccessMessage('Welcome!');
            } else {
                this.showError(
                    'login-error',
                    data.error || 'Google authentication failed'
                );
            }
        } catch (error) {
            console.error('Google auth error:', error);
            this.showError(
                'login-error',
                'Google authentication failed - network error'
            );
        }
    }

    async logout() {
        try {
            const csrfToken = await this.getCsrfToken();
            if (this.sessionId) {
                await fetch('/api/auth/logout', {
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': csrfToken, // Add CSRF token for logout too
                    },
                });
            }
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            // Clear local data regardless of API result
            this.deleteCookie('loginProvider');
            this.deleteCookie('userPrefs');
            this.deleteCookie('isNewUser');

            this.currentUser = null;
            this.showNotAuthenticated();
            this.showSuccessMessage('Logged out successfully');
        }
    }

    showAuthenticated(user) {
        const loggedInElement = document.getElementById('auth-logged-in');
        const notLoggedInElement =
            document.getElementById('auth-not-logged-in');

        if (loggedInElement && notLoggedInElement) {
            loggedInElement.classList.remove('hidden');
            notLoggedInElement.classList.add('hidden');

            // Update user info in the UI
            const avatarElement = document.getElementById('user-avatar');
            const displayNameElement =
                document.getElementById('user-display-name');
            const emailElement = document.getElementById('user-email');

            if (avatarElement && user.profilePicture) {
                avatarElement.src = user.profilePicture;
            }
            if (displayNameElement) {
                displayNameElement.textContent =
                    user.displayName || user.username;
            }
            if (emailElement) {
                emailElement.textContent = user.email;
            }
        }
    }

    showNotAuthenticated() {
        const loggedInElement = document.getElementById('auth-logged-in');
        const notLoggedInElement =
            document.getElementById('auth-not-logged-in');

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
        notification.className =
            'alert alert-success fixed top-4 right-4 w-auto z-50';
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

    setCookie(name, value, days = 7, options = {}) {
        const defaults = {
            path: '/',
            secure: window.location.protocol === 'https:',
            sameSite: 'Strict',
        };

        const config = { ...defaults, ...options };

        let cookieString = `${name}=${encodeURIComponent(value)}`;

        if (days) {
            const date = new Date();
            date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
            cookieString += `; expires=${date.toUTCString()}`;
        }

        Object.entries(config).forEach(([key, val]) => {
            if (val === true) {
                cookieString += `; ${key}`;
            } else if (val) {
                cookieString += `; ${key}=${val}`;
            }
        });

        document.cookie = cookieString;
    }

    getCookie(name) {
        const nameEQ = `${name}=`;
        const ca = document.cookie.split(';');

        for (let c of ca) {
            c = c.trim();
            if (c.indexOf(nameEQ) === 0) {
                return decodeURIComponent(c.substring(nameEQ.length));
            }
        }
        return null;
    }

    deleteCookie(name, path = '/') {
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=${path};`;
    }

    isAuthenticatedForGames() {
        return this.currentUser && this.currentUser.id;
    }

    handleGameAuthError(errorData, aiThoughtsElementId = 'ai-thoughts') {
        if (errorData.requiresAuth) {
            // Show the AI thought about needing to log in
            if (errorData.aiThought) {
                this.updateAIThoughts(aiThoughtsElementId, errorData.aiThought);
            }

            // Show the login required modal
            this.showLoginRequiredModal();
            return true;
        }
        return false;
    }

    showLoginRequiredModal() {
        this.openModal('login-required-modal');
    }

    updateAIThoughts(elementId, message) {
        const aiThoughtsElement = document.getElementById(elementId);
        if (aiThoughtsElement) {
            aiThoughtsElement.textContent = message;
        }
    }

    checkAuthBeforeGameAction(
        actionName = 'play',
        aiThoughtsElementId = 'ai-thoughts'
    ) {
        if (!this.isAuthenticatedForGames()) {
            this.updateAIThoughts(
                aiThoughtsElementId,
                `I can only ${actionName} with authenticated users - please log in first!`
            );
            this.showLoginRequiredModal();
            return false;
        }
        return true;
    }

    async handleGameApiCall(apiCall, aiThoughtsElementId = 'ai-thoughts') {
        try {
            const response = await apiCall();

            if (!response.ok) {
                const errorData = await response.json();

                // Handle authentication errors specifically
                if (
                    response.status === 401 &&
                    this.handleGameAuthError(errorData, aiThoughtsElementId)
                ) {
                    return null;
                }

                // Handle other errors
                if (errorData.aiThought) {
                    this.updateAIThoughts(
                        aiThoughtsElementId,
                        errorData.aiThought
                    );
                } else {
                    this.updateAIThoughts(
                        aiThoughtsElementId,
                        errorData.message ||
                            'Something went wrong. Please try again.'
                    );
                }

                return null;
            }

            return await response.json();
        } catch (error) {
            console.error('Game API call failed:', error);
            this.updateAIThoughts(
                aiThoughtsElementId,
                'Network error. Please check your connection and try again.'
            );
            return null;
        }
    }

    async getCsrfToken() {
        try {
            const response = await fetch('/api/csrf-token', {
                credentials: 'include',
            });

            if (!response.ok) {
                console.error('Failed to get CSRF token:', response.status);
                return null;
            }

            const data = await response.json();
            return data.csrfToken;
        } catch (error) {
            console.error('Failed to get CSRF token:', error);
            return null;
        }
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

window.showLoginRequiredModal = function () {
    if (window.authManager) {
        window.authManager.showLoginRequiredModal();
    }
};

window.checkAuthForGame = function (
    actionName = 'play',
    aiThoughtsElementId = 'ai-thoughts'
) {
    if (window.authManager) {
        return window.authManager.checkAuthBeforeGameAction(
            actionName,
            aiThoughtsElementId
        );
    }
    return false;
};

// Initialize auth manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.authManager = new AuthManager();
});
