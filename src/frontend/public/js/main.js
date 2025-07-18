// Main application entry point - Fixed version
class App {
    constructor() {
        this.apiClient = new ApiClient();
        this.init();
    }

    async init() {
        // Check if user is already authenticated
        try {
            const user = await this.apiClient.getCurrentUser();
            if (user) {
                window.Components.currentUser = user;
            }
        } catch (error) {
            console.log('No authenticated user');
        }

        // Initialize all page components
        window.Components.initializePage();

        // Set up global event listeners
        this.setupGlobalListeners();

        // Handle initial page load routing
        this.navigate(window.location.pathname, false);
    }

    setupGlobalListeners() {
        // Handle navigation without page reload (SPA behavior)
        document.addEventListener('click', (e) => {
            // Handle both href and data-route attributes
            const href = e.target.getAttribute('href');
            const route = e.target.getAttribute('data-route');

            if (href && href.startsWith('/')) {
                e.preventDefault();
                this.navigate(href);
            } else if (route) {
                e.preventDefault();
                const path = route === 'home' ? '/' : `/${route}`;
                this.navigate(path);
            }
        });

        // Handle browser back/forward buttons
        window.addEventListener('popstate', (e) => {
            this.navigate(window.location.pathname, false);
        });
    }

    navigate(path, pushState = true) {
        // Update URL if needed
        if (pushState) {
            history.pushState(null, null, path);
        }

        // Add page transition effect
        const mainContainer = document.getElementById('main-container');
        mainContainer.style.opacity = '0.7';
        mainContainer.style.transform = 'translateY(10px)';

        setTimeout(() => {
            // Update page content based on path
            switch (path) {
                case '/':
                    this.loadHomePage();
                    break;
                case '/games':
                    this.loadGamesPage();
                    break;
                case '/about':
                    this.loadAboutPage();
                    break;
                case '/profile':
                    this.loadProfilePage();
                    break;
                default:
                    if (path.startsWith('/game/')) {
                        this.loadGamePage(path.split('/')[2]);
                    } else {
                        this.load404Page();
                    }
            }

            // Complete transition
            mainContainer.style.transition = 'all 0.3s ease';
            mainContainer.style.opacity = '1';
            mainContainer.style.transform = 'translateY(0)';

            // Update active nav links
            this.updateActiveNavLinks(path);
        }, 150);
    }

    updateActiveNavLinks(currentPath) {
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
            const route = link.getAttribute('data-route');
            const href = link.getAttribute('href');

            if ((route === 'home' && currentPath === '/') ||
                (href && href === currentPath) ||
                (route && `/${route}` === currentPath)) {
                link.classList.add('active');
            }
        });
    }

    loadHomePage() {
        // Reset main container with new viewport-bound structure
        document.getElementById('main-container').innerHTML = `
            <div id="hero-section" class="hero-container"></div>
            <div id="games-section"></div>
        `;

        // Add viewport-locked class to body
        document.body.classList.add('viewport-locked');

        // Re-initialize all home page components
        window.Components.initializePage();

        // Setup games scroll after components are loaded
        setTimeout(() => {
            this.setupGamesScroll();
        }, 100);
    }

    setupGamesScroll() {
        const gamesContainer = document.getElementById('games-container');
        if (!gamesContainer) return;

        gamesContainer.style.scrollBehavior = 'smooth';

        let autoScrollInterval = setInterval(() => {
            const maxScroll = gamesContainer.scrollHeight - gamesContainer.clientHeight;
            if (gamesContainer.scrollTop >= maxScroll) {
                gamesContainer.scrollTo({ top: 0, behavior: 'smooth' });
            } else {
                gamesContainer.scrollBy({ top: 100, behavior: 'smooth' });
            }
        }, 4000);

        // Stop auto-scroll on user interaction
        gamesContainer.addEventListener('mouseenter', () => clearInterval(autoScrollInterval));
        gamesContainer.addEventListener('scroll', () => clearInterval(autoScrollInterval));
    }

    loadGamesPage() {
        // Remove viewport lock for full games page
        document.body.classList.remove('viewport-locked');

        document.getElementById('main-container').innerHTML = `
            <div class="text-center mb-8">
                <h1 class="text-4xl font-bold mb-4">All Games</h1>
                <p class="text-lg opacity-70">Choose your challenge and help train our AI</p>
            </div>
            <div id="games-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"></div>
        `;

        // Load games in grid format
        window.Components.loadGames().then(games => {
            const grid = document.getElementById('games-grid');
            grid.innerHTML = games.map(game =>
                window.Components.render('game-card-full', game)
            ).join('');

            games.forEach(game => {
                window.Components.initializeGameCard(game);
            });
        });
    }

    loadAboutPage() {
        document.body.classList.remove('viewport-locked');
        document.getElementById('main-container').innerHTML = `
            <div class="max-w-4xl mx-auto">
                <div class="text-center mb-12">
                    <h1 class="text-4xl font-bold mb-4">About AI Game Hub</h1>
                    <p class="text-lg opacity-70">Creating the future of adaptive gaming</p>
                </div>
                
                <div class="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
                    <div class="card bg-base-100 shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-2">
                        <div class="card-body">
                            <div class="text-4xl mb-4 text-center">🎯</div>
                            <h2 class="card-title justify-center">Our Mission</h2>
                            <p class="text-center opacity-70">To create AI-powered games that adapt and learn from every player interaction, providing personalized and engaging experiences.</p>
                        </div>
                    </div>
                    
                    <div class="card bg-base-100 shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-2">
                        <div class="card-body">
                            <div class="text-4xl mb-4 text-center">🤖</div>
                            <h2 class="card-title justify-center">Our Technology</h2>
                            <p class="text-center opacity-70">Advanced machine learning algorithms that continuously improve gameplay based on user behavior and preferences.</p>
                        </div>
                    </div>
                </div>
                
                <div class="prose prose-lg max-w-none mb-8">
                    <h2>How It Works</h2>
                    <p>Our AI models are trained entirely through player interactions. Every game you play contributes to a growing dataset that helps our AI understand strategy, pattern recognition, and adaptive gameplay.</p>
                    
                    <h2>Technology Stack</h2>
                    <p>Built with modern web technologies and powered by machine learning algorithms that process gameplay data in real-time. Our monolithic Node.js architecture ensures lightning-fast responses while Python AI modules handle the complex learning algorithms.</p>
                </div>
                
                <div class="text-center">
                    <button class="btn btn-primary btn-lg" data-route="games">
                        <span class="mr-2">🎮</span>
                        Try Our Games
                    </button>
                </div>
            </div>
        `;
    }

    loadProfilePage() {
        if (!window.Components.currentUser) {
            window.Components.showLoginModal();
            return;
        }

        document.getElementById('main-container').innerHTML = `
            <div class="max-w-2xl mx-auto">
                <h1 class="text-4xl font-bold mb-8 text-center">Profile</h1>
                <div class="card bg-base-100 shadow-xl">
                    <div class="card-body">
                        <h2 class="card-title">
                            <span class="text-2xl mr-2">👤</span>
                            User Information
                        </h2>
                        <div class="form-control">
                            <label class="label">
                                <span class="label-text">Email</span>
                            </label>
                            <input type="email" value="${window.Components.currentUser.email}" class="input input-bordered" readonly />
                        </div>
                        <div class="form-control">
                            <label class="label">
                                <span class="label-text">Display Name</span>
                            </label>
                            <input type="text" value="${window.Components.currentUser.displayName || ''}" class="input input-bordered" id="display-name-input" />
                        </div>
                        <div class="card-actions justify-end">
                            <button class="btn btn-primary" id="save-profile-btn">
                                <span class="mr-1">💾</span>
                                Save Changes
                            </button>
                        </div>
                    </div>
                </div>
                
                <div class="card bg-base-100 shadow-xl mt-6">
                    <div class="card-body">
                        <h2 class="card-title">
                            <span class="text-2xl mr-2">📊</span>
                            Game Statistics
                        </h2>
                        <div class="stats stats-vertical lg:stats-horizontal shadow">
                            <div class="stat">
                                <div class="stat-figure text-primary">
                                    <span class="text-2xl">🎮</span>
                                </div>
                                <div class="stat-title">Games Played</div>
                                <div class="stat-value text-primary">${window.Components.currentUser.gamesPlayed || 0}</div>
                            </div>
                            <div class="stat">
                                <div class="stat-figure text-secondary">
                                    <span class="text-2xl">🏆</span>
                                </div>
                                <div class="stat-title">Win Rate</div>
                                <div class="stat-value text-secondary">${window.Components.currentUser.winRate || 0}%</div>
                            </div>
                            <div class="stat">
                                <div class="stat-figure text-accent">
                                    <span class="text-2xl">🧠</span>
                                </div>
                                <div class="stat-title">AI Training Contributions</div>
                                <div class="stat-value text-accent">${window.Components.currentUser.aiContributions || 0}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Add save profile functionality
        document.getElementById('save-profile-btn').addEventListener('click', async () => {
            const displayName = document.getElementById('display-name-input').value;
            try {
                await this.apiClient.updateProfile({ displayName });
                window.Components.currentUser.displayName = displayName;
                window.Components.refreshAuthComponent();
                this.showNotification('Profile updated successfully! 🎉', 'success');
            } catch (error) {
                this.showNotification('Failed to update profile ❌', 'error');
            }
        });
    }

    loadGamePage(gameId) {
        if (!window.Components.currentUser) {
            window.Components.showLoginModal();
            return;
        }

        document.getElementById('main-container').innerHTML = `
            <div class="text-center">
                <h1 class="text-4xl font-bold mb-4">Loading Game: ${gameId}</h1>
                <p class="text-lg mb-8">Preparing your AI opponent...</p>
                <span class="loading loading-spinner loading-lg text-primary"></span>
            </div>
        `;

        // This would load the specific game component
        setTimeout(() => {
            document.getElementById('main-container').innerHTML = `
                <div class="text-center">
                    <div class="text-6xl mb-4">🎮</div>
                    <h1 class="text-4xl font-bold mb-4">Game: ${gameId}</h1>
                    <p class="text-lg mb-8 opacity-70">Game implementation coming soon!</p>
                    <button class="btn btn-primary btn-lg" data-route="home">
                        <span class="mr-2">🏠</span>
                        Back to Home
                    </button>
                </div>
            `;
        }, 1000);
    }

    load404Page() {
        document.getElementById('main-container').innerHTML = `
            <div class="text-center">
                <div class="text-8xl mb-4">😵</div>
                <h1 class="text-6xl font-bold mb-4">404</h1>
                <p class="text-2xl mb-8 opacity-70">Page not found</p>
                <button class="btn btn-primary btn-lg" data-route="home">
                    <span class="mr-2">🏠</span>
                    Go Home
                </button>
            </div>
        `;
    }

    // New notification system
    showNotification(message, type = 'info') {
        // Remove existing notifications
        document.querySelectorAll('.app-notification').forEach(n => n.remove());

        // Create notification element
        const notification = document.createElement('div');
        notification.className = `alert alert-${type} fixed top-20 right-4 z-50 w-auto max-w-sm shadow-lg app-notification`;
        notification.innerHTML = `
            <div>
                <span>${message}</span>
            </div>
        `;

        document.body.appendChild(notification);

        // Animate in
        notification.style.transform = 'translateX(100%)';
        notification.style.transition = 'transform 0.3s ease';
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 10);

        // Remove after 3 seconds
        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }
}

// API Client for backend communication - Enhanced with better error handling
class ApiClient {
    constructor() {
        this.baseUrl = '/api';
    }

    async request(endpoint, options = {}) {
        try {
            const response = await fetch(`${this.baseUrl}${endpoint}`, {
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                ...options
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return response.json();
        } catch (error) {
            console.error('API request failed:', error);

            // Only show notification for unexpected errors
            // Don't show error for auth/me 401 responses (expected when not logged in)
            const isAuthCheck = endpoint === '/auth/me';
            const is401 = error.message.includes('401');

            if (!isAuthCheck || !is401) {
                if (window.App) {
                    window.App.showNotification('Connection error. Please try again. 🔄', 'error');
                }
            }

            throw error;
        }
    }

    async getCurrentUser() {
        return this.request('/auth/me');
    }

    async updateProfile(data) {
        return this.request('/auth/profile', {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    }

    async getGames() {
        return this.request('/games');
    }

    async getGameState(gameId) {
        return this.request(`/games/${gameId}`);
    }

    async makeMove(gameId, moveData) {
        return this.request(`/games/${gameId}/move`, {
            method: 'POST',
            body: JSON.stringify(moveData)
        });
    }

    async getLeaderboard(gameId) {
        return this.request(`/games/${gameId}/leaderboard`);
    }

    // Health check method for testing
    async healthCheck() {
        return this.request('/health');
    }

    async testDatabase() {
        return this.request('/test-db');
    }
}

// Initialize the application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.App = new App();

    // Add development helper if on localhost
    if (window.location.hostname === 'localhost') {
        const testBtn = document.createElement('button');
        testBtn.className = 'btn btn-sm btn-outline fixed bottom-4 right-4 z-50';
        testBtn.innerHTML = '<span class="mr-1">🔧</span>Test API';
        testBtn.onclick = async () => {
            try {
                const health = await window.App.apiClient.healthCheck();
                const db = await window.App.apiClient.testDatabase();
                window.App.showNotification('✅ All systems operational!', 'success');
                console.log('Health:', health, 'DB:', db);
            } catch (error) {
                window.App.showNotification('❌ System check failed', 'error');
            }
        };
        document.body.appendChild(testBtn);
    }
});