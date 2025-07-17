class GameClient {
    constructor() {
        this.gameContainer = document.getElementById('game-container');
        this.init();
    }

    async init() {
        // Initialize game UI
        this.renderGameUI();

        // Load initial game state
        await this.loadGameState();
    }

    renderGameUI() {
        this.gameContainer.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="card bg-base-100 shadow-xl">
                    <div class="card-body">
                        <h2 class="card-title">Game Board</h2>
                        <div id="game-board" class="min-h-64 bg-base-200 rounded">
                            <!-- Game board content -->
                        </div>
                    </div>
                </div>
                <div class="card bg-base-100 shadow-xl">
                    <div class="card-body">
                        <h2 class="card-title">Controls</h2>
                        <button id="make-move-btn" class="btn btn-primary">Make Move</button>
                        <button id="ai-move-btn" class="btn btn-secondary">AI Move</button>
                    </div>
                </div>
            </div>
        `;

        // Add event listeners
        document.getElementById('make-move-btn').addEventListener('click', () => this.makeMove());
        document.getElementById('ai-move-btn').addEventListener('click', () => this.requestAIMove());
    }

    async loadGameState() {
        try {
            const response = await fetch('/api/game/state');
            const gameState = await response.json();
            // Update UI with game state
            console.log('Game state loaded:', gameState);
        } catch (error) {
            console.error('Error loading game state:', error);
        }
    }

    async makeMove() {
        // Implement player move logic
        console.log('Player move');
    }

    async requestAIMove() {
        try {
            const response = await fetch('/api/ai/move', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ gameState: 'current_state' })
            });
            const aiMove = await response.json();
            console.log('AI move:', aiMove);
        } catch (error) {
            console.error('Error requesting AI move:', error);
        }
    }
}

// Initialize the game when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new GameClient();
});