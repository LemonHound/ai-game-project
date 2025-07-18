// Component System - Fixed version
class ComponentSystem {
    constructor() {
        this.components = new Map();
        this.currentUser = null;
        this.loadTemplates();
    }

    // Load all template scripts into memory
    loadTemplates() {
        const templates = document.querySelectorAll('script[type="text/template"]');
        templates.forEach(template => {
            const name = template.id.replace('-template', '');
            this.components.set(name, template.innerHTML);
        });
    }

    // Render a component with data (similar to Rails render partial: with locals:)
    render(componentName, data = {}) {
        const template = this.components.get(componentName);
        if (!template) {
            console.error(`Component '${componentName}' not found`);
            return '';
        }

        // Simple template interpolation
        return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
            return data[key] !== undefined ? data[key] : match;
        });
    }

    // Mount a component to a DOM element
    mount(containerId, componentName, data = {}) {
        const container = document.getElementById(containerId);
        if (!container) {
            console.error(`Container '${containerId}' not found`);
            return;
        }

        const html = this.render(componentName, data);
        container.innerHTML = html;
        container.classList.add('component-fade-in');

        // Trigger component-specific initialization
        this.initializeComponent(componentName, containerId, data);
    }

    // Initialize component-specific functionality
    initializeComponent(componentName, containerId, data) {
        switch (componentName) {
            case 'header':
                this.initializeHeader();
                break;
            case 'auth-login':
                this.initializeLoginButton();
                break;
            case 'auth-profile':
                this.initializeProfileDropdown(data);
                break;
            case 'hero':
                this.initializeHero();
                break;
            case 'games-section':
                this.initializeGamesSection();
                break;
            case 'game-card':
                this.initializeGameCard(data);
                break;
        }
    }

    // Component-specific initialization methods
    initializeHeader() {
        // Render auth component based on user state
        if (this.currentUser) {
            this.mount('auth-component', 'auth-profile', {
                initials: this.getUserInitials(this.currentUser.displayName || this.currentUser.email)
            });
        } else {
            this.mount('auth-component', 'auth-login');
        }
    }

    initializeLoginButton() {
        const loginBtn = document.getElementById('login-btn');
        if (loginBtn) {
            loginBtn.addEventListener('click', () => {
                this.showLoginModal();
            });
        }
    }

    initializeProfileDropdown(data) {
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                this.logout();
            });
        }
    }

    initializeHero() {
        const getStartedBtn = document.getElementById('get-started-btn');
        if (getStartedBtn) {
            getStartedBtn.addEventListener('click', () => {
                if (this.currentUser) {
                    // Scroll to games section
                    const gamesSection = document.getElementById('games-section');
                    if (gamesSection) {
                        gamesSection.scrollIntoView({ behavior: 'smooth' });
                    }
                } else {
                    this.showLoginModal();
                }
            });
        }
    }

    initializeGamesSection() {
        // Load and render game cards
        this.loadGames().then(games => {
            const gamesContainer = document.getElementById('games-container');
            if (gamesContainer) {
                gamesContainer.innerHTML = games.map(game =>
                    this.render('game-card', game)
                ).join('');

                // Initialize each game card
                games.forEach(game => {
                    this.initializeGameCard(game);
                });
            }
        });
    }

    initializeGameCard(game) {
        // Find the play button for this specific game
        const playBtn = document.querySelector(`[data-game-id="${game.id}"]`);
        if (playBtn) {
            playBtn.addEventListener('click', () => {
                this.playGame(game.id);
            });
        }
    }

    // Utility methods
    getUserInitials(name) {
        return name.split(' ').map(word => word[0]).join('').toUpperCase().slice(0, 2);
    }

    // Mock data method - replace with actual API call
    async loadGames() {
        // This would typically fetch from /api/games
        return [
            {
                id: 'tic-tac-toe',
                name: 'Tic Tac Toe',
                description: 'Classic game with an AI that learns your strategies',
                icon: '⭕'
            },
            {
                id: 'connect-four',
                name: 'Connect Four',
                description: 'Drop pieces and outsmart our adaptive AI',
                icon: '🔴'
            },
            {
                id: 'word-game',
                name: 'Word Challenge',
                description: 'Test your vocabulary against our learning AI',
                icon: '📝'
            },
            {
                id: 'puzzle-game',
                name: 'Logic Puzzles',
                description: 'Solve puzzles while training our AI',
                icon: '🧩'
            },
            {
                id: 'strategy-game',
                name: 'Strategy Battle',
                description: 'Complex strategy game with evolving AI',
                icon: '⚔️'
            }
        ];
    }

    // Authentication methods
    showLoginModal() {
        // Create a simple modal for login
        const modal = document.createElement('div');
        modal.innerHTML = `
            <div class="modal modal-open">
                <div class="modal-box">
                    <h3 class="font-bold text-lg">Login or Sign Up</h3>
                    <div class="py-4">
                        <div class="form-control">
                            <label class="label">
                                <span class="label-text">Email</span>
                            </label>
                            <input type="email" id="login-email" class="input input-bordered" />
                        </div>
                        <div class="form-control">
                            <label class="label">
                                <span class="label-text">Password</span>
                            </label>
                            <input type="password" id="login-password" class="input input-bordered" />
                        </div>
                        <div class="form-control mt-4">
                            <label class="label">
                                <span class="label-text">Display Name (for new accounts)</span>
                            </label>
                            <input type="text" id="login-display-name" class="input input-bordered" />
                        </div>
                    </div>
                    <div class="modal-action">
                        <button class="btn btn-primary" id="modal-login-btn">Login</button>
                        <button class="btn btn-secondary" id="modal-signup-btn">Sign Up</button>
                        <button class="btn" id="modal-close-btn">Cancel</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Add event listeners
        document.getElementById('modal-login-btn').addEventListener('click', () => {
            this.handleLogin();
        });

        document.getElementById('modal-signup-btn').addEventListener('click', () => {
            this.handleSignup();
        });

        document.getElementById('modal-close-btn').addEventListener('click', () => {
            document.body.removeChild(modal);
        });
    }

    async handleLogin() {
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, password })
            });

            if (response.ok) {
                const user = await response.json();
                this.currentUser = user;
                this.closeModal();
                this.refreshAuthComponent();
            } else {
                alert('Login failed');
            }
        } catch (error) {
            console.error('Login error:', error);
            alert('Login failed');
        }
    }

    async handleSignup() {
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        const displayName = document.getElementById('login-display-name').value;

        try {
            const response = await fetch('/api/auth/signup', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, password, displayName })
            });

            if (response.ok) {
                const user = await response.json();
                this.currentUser = user;
                this.closeModal();
                this.refreshAuthComponent();
            } else {
                alert('Signup failed');
            }
        } catch (error) {
            console.error('Signup error:', error);
            alert('Signup failed');
        }
    }

    async logout() {
        try {
            await fetch('/api/auth/logout', { method: 'POST' });
            this.currentUser = null;
            this.refreshAuthComponent();
        } catch (error) {
            console.error('Logout error:', error);
        }
    }

    closeModal() {
        const modal = document.querySelector('.modal');
        if (modal) {
            modal.parentElement.removeChild(modal);
        }
    }

    refreshAuthComponent() {
        this.initializeHeader();
    }

    async playGame(gameId) {
        if (!this.currentUser) {
            this.showLoginModal();
            return;
        }

        // Navigate to game page
        window.location.href = `/game/${gameId}`;
    }

    // Initialize the entire page - ONLY for home page
    initializePage() {
        // Only initialize header, hero, and games for home page
        this.mount('header-container', 'header');

        // Check if we're on home page by looking for hero-section
        const heroSection = document.getElementById('hero-section');
        const gamesSection = document.getElementById('games-section');

        if (heroSection) {
            this.mount('hero-section', 'hero');
        }

        if (gamesSection) {
            this.mount('games-section', 'games-section');
        }

        // Only mount links-section if it exists (not on new layout)
        const linksSection = document.getElementById('links-section');
        if (linksSection) {
            this.mount('links-section', 'links-section');
        }
    }
}

// Global component system instance
window.Components = new ComponentSystem();