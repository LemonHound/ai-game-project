async function checkAuthStatus() {
    try {
        const response = await fetch('/api/auth/me', {
            credentials: 'include',
            headers: { Accept: 'application/json' },
            cache: 'no-cache',
        });

        if (response.ok) {
            showGameContainer();
            // Initialize game after auth confirmed
            window.pongGame = new PongGame();
        } else {
            console.log('Not authenticated');
            showAuthGate();
        }
    } catch (error) {
        console.error('Auth check failed:', error);
        showAuthGate();
    }
}

function showAuthGate() {
    const authGate = document.getElementById('auth-gate');
    const gameContainer = document.getElementById('game-container');
    if (authGate) authGate.classList.remove('hidden');
    if (gameContainer) gameContainer.classList.add('hidden');
}

function showGameContainer() {
    const authGate = document.getElementById('auth-gate');
    const gameContainer = document.getElementById('game-container');
    if (authGate) authGate.classList.add('hidden');
    if (gameContainer) gameContainer.classList.remove('hidden');
}

function openLoginModal() {
    const modal = document.getElementById('login-modal');
    if (modal) modal.showModal();
}

class PongGame {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.parentContainer = null;
        this.gameRunning = false;
        this.gameStarted = false;
        this.playerSide = null; // 'left' or 'right'

        // Game dimensions
        this.width = 800;
        this.height = 400;
        this.paddleWidth = 15;
        this.paddleHeight = 80;
        this.ballSize = 12;

        // Paddle positions and properties
        this.leftPaddle = {
            x: 20,
            y: this.height / 2 - this.paddleHeight / 2,
            speed: 0,
            maxSpeed: 8,
        };

        this.rightPaddle = {
            x: this.width - 20 - this.paddleWidth,
            y: this.height / 2 - this.paddleHeight / 2,
            speed: 0,
            maxSpeed: 8,
        };

        // Ball properties
        this.ball = {
            x: this.width / 2,
            y: this.height / 2,
            velocityX: 0,
            velocityY: 0,
            baseSpeed: 4,
            speed: 4,
            maxSpeed: 12,
            speedIncrement: 0.1,
        };

        // Game state
        this.score = { left: 0, right: 0 };
        this.ballAttached = false;
        this.attachedToPaddle = null;
        this.mousePressed = false;
        this.mouseY = 0;
        this.ballOffsetY = 0;

        this.init();
    }

    init() {
        this.canvas = document.getElementById('game-board');
        if (!this.canvas) {
            console.error('Canvas not found!');
            return;
        }

        this.ctx = this.canvas.getContext('2d');
        this.parentContainer = document.getElementById('pong-container');

        if (!this.parentContainer) {
            console.error('Pong container not found!');
            return;
        }

        // Set up pixelated rendering
        this.ctx.imageSmoothingEnabled = false;

        this.setupEventListeners();
        this.render();
        this.updateStatus();
    }

    setupEventListeners() {
        // Click events stay on canvas for game start and ball launching
        this.canvas.addEventListener('click', e => {
            if (!this.gameStarted) {
                const rect = this.canvas.getBoundingClientRect();
                const clickX = e.clientX - rect.left;

                if (clickX < this.width / 2) {
                    this.playerSide = 'left';
                } else {
                    this.playerSide = 'right';
                }

                this.startGame();
            }

            // Handle ball launch when attached
            if (this.ballAttached && this.mousePressed) {
                this.launchBall();
            }
        });

        // Mouse movement bound to parent container for better control
        this.parentContainer.addEventListener('mousemove', e => {
            if (!this.gameRunning) return;

            const canvasRect = this.canvas.getBoundingClientRect();
            this.mouseY = e.clientY - canvasRect.top;

            // Clamp mouseY to canvas bounds for calculations
            this.mouseY = Math.max(0, Math.min(this.height, this.mouseY));

            if (this.ballAttached && this.mousePressed) {
                // Move ball up/down on paddle when mouse is pressed
                const paddle = this.attachedToPaddle === 'left' ? this.leftPaddle : this.rightPaddle;
                const maxOffset = this.paddleHeight / 2 - this.ballSize / 2;
                this.ballOffsetY = Math.max(
                    -maxOffset,
                    Math.min(maxOffset, this.mouseY - paddle.y - this.paddleHeight / 2)
                );
            } else {
                this.updatePaddlePosition();
            }
        });

        // Mouse press events on parent container
        this.parentContainer.addEventListener('mousedown', e => {
            if (this.ballAttached) {
                this.mousePressed = true;
            }
        });

        this.parentContainer.addEventListener('mouseup', e => {
            if (this.ballAttached && this.mousePressed) {
                this.launchBall();
            }
            this.mousePressed = false;
        });
    }

    startGame() {
        this.gameStarted = true;
        this.gameRunning = true;
        this.attachBallToPaddle(this.playerSide);
        this.updateStatus();
        this.gameLoop();
    }

    updatePaddlePosition() {
        const paddle = this.playerSide === 'left' ? this.leftPaddle : this.rightPaddle;
        const targetY = this.mouseY - this.paddleHeight / 2;
        const paddleCenter = paddle.y + this.paddleHeight / 2;
        const offset = this.mouseY - paddleCenter;

        // Calculate speed based on offset from center
        paddle.speed = (Math.abs(offset) / this.paddleHeight) * paddle.maxSpeed;

        // Move paddle towards mouse position
        if (this.mouseY < paddleCenter) {
            paddle.y = Math.max(0, paddle.y - paddle.speed);
        } else if (this.mouseY > paddleCenter) {
            paddle.y = Math.min(this.height - this.paddleHeight, paddle.y + paddle.speed);
        }

        // Update ball position if attached
        if (this.ballAttached && this.attachedToPaddle === this.playerSide) {
            this.ball.y = paddle.y + this.paddleHeight / 2 + this.ballOffsetY;
        }
    }

    attachBallToPaddle(side) {
        this.ballAttached = true;
        this.attachedToPaddle = side;
        this.ballOffsetY = 0;

        const paddle = side === 'left' ? this.leftPaddle : this.rightPaddle;
        this.ball.x = side === 'left' ? paddle.x + this.paddleWidth + this.ballSize / 2 : paddle.x - this.ballSize / 2;
        this.ball.y = paddle.y + this.paddleHeight / 2;
        this.ball.velocityX = 0;
        this.ball.velocityY = 0;
    }

    launchBall() {
        if (!this.ballAttached) return;

        const launchDirection = this.attachedToPaddle === 'left' ? 1 : -1;
        const launchAngle = ((this.ballOffsetY / (this.paddleHeight / 2)) * Math.PI) / 4; // Max 45 degrees

        this.ball.velocityX = this.ball.baseSpeed * launchDirection * Math.cos(launchAngle);
        this.ball.velocityY = this.ball.baseSpeed * Math.sin(launchAngle);

        this.ballAttached = false;
        this.attachedToPaddle = null;
        this.mousePressed = false;
        this.ballOffsetY = 0;
    }

    update() {
        if (!this.gameRunning || this.ballAttached) return;

        // Update ball position
        this.ball.x += this.ball.velocityX;
        this.ball.y += this.ball.velocityY;

        // Ball collision with top/bottom walls
        if (this.ball.y <= this.ballSize / 2 || this.ball.y >= this.height - this.ballSize / 2) {
            this.ball.velocityY = -this.ball.velocityY;
            this.ball.y = Math.max(this.ballSize / 2, Math.min(this.height - this.ballSize / 2, this.ball.y));
        }

        // Ball collision with paddles
        this.checkPaddleCollision(this.leftPaddle, 'left');
        this.checkPaddleCollision(this.rightPaddle, 'right');

        // Ball out of bounds (scoring)
        if (this.ball.x <= 0) {
            this.score.right++;
            this.attachBallToPaddle('left');
            this.updateStatus();
        } else if (this.ball.x >= this.width) {
            this.score.left++;
            this.attachBallToPaddle('right');
            this.updateStatus();
        }
    }

    checkPaddleCollision(paddle, side) {
        const ballLeft = this.ball.x - this.ballSize / 2;
        const ballRight = this.ball.x + this.ballSize / 2;
        const ballTop = this.ball.y - this.ballSize / 2;
        const ballBottom = this.ball.y + this.ballSize / 2;

        const paddleLeft = paddle.x;
        const paddleRight = paddle.x + this.paddleWidth;
        const paddleTop = paddle.y;
        const paddleBottom = paddle.y + this.paddleHeight;

        // Check collision
        if (ballRight >= paddleLeft && ballLeft <= paddleRight && ballBottom >= paddleTop && ballTop <= paddleBottom) {
            // Calculate bounce angle based on hit position
            const hitPosition = (this.ball.y - (paddle.y + this.paddleHeight / 2)) / (this.paddleHeight / 2);
            const bounceAngle = (hitPosition * Math.PI) / 4; // Max 45 degrees

            // Increase speed slightly with each hit
            this.ball.speed = Math.min(this.ball.maxSpeed, this.ball.speed + this.ball.speedIncrement);

            // Set new velocity
            const direction = side === 'left' ? 1 : -1;
            this.ball.velocityX = this.ball.speed * direction * Math.cos(bounceAngle);
            this.ball.velocityY = this.ball.speed * Math.sin(bounceAngle);

            // Prevent ball from getting stuck in paddle
            if (side === 'left') {
                this.ball.x = paddleRight + this.ballSize / 2;
            } else {
                this.ball.x = paddleLeft - this.ballSize / 2;
            }
        }
    }

    render() {
        // Clear canvas with black background
        this.ctx.fillStyle = '#000000';
        this.ctx.fillRect(0, 0, this.width, this.height);

        // Draw center line
        this.ctx.strokeStyle = '#FFFFFF';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([10, 10]);
        this.ctx.beginPath();
        this.ctx.moveTo(this.width / 2, 0);
        this.ctx.lineTo(this.width / 2, this.height);
        this.ctx.stroke();
        this.ctx.setLineDash([]);

        // Draw paddles
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.fillRect(this.leftPaddle.x, this.leftPaddle.y, this.paddleWidth, this.paddleHeight);
        this.ctx.fillRect(this.rightPaddle.x, this.rightPaddle.y, this.paddleWidth, this.paddleHeight);

        // Draw ball
        this.ctx.fillRect(
            this.ball.x - this.ballSize / 2,
            this.ball.y - this.ballSize / 2,
            this.ballSize,
            this.ballSize
        );

        // Draw ball trajectory preview when attached and aiming
        if (this.ballAttached && this.mousePressed) {
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            this.ctx.lineWidth = 1;
            this.ctx.setLineDash([5, 5]);

            const launchDirection = this.attachedToPaddle === 'left' ? 1 : -1;
            const launchAngle = ((this.ballOffsetY / (this.paddleHeight / 2)) * Math.PI) / 4;
            const trajectoryLength = 100;

            const endX = this.ball.x + trajectoryLength * launchDirection * Math.cos(launchAngle);
            const endY = this.ball.y + trajectoryLength * Math.sin(launchAngle);

            this.ctx.beginPath();
            this.ctx.moveTo(this.ball.x, this.ball.y);
            this.ctx.lineTo(endX, endY);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
        }
    }

    updateStatus() {
        const scoreDisplay = document.getElementById('score-display');
        const statusText = document.getElementById('status-text');

        if (scoreDisplay) {
            scoreDisplay.textContent = `${this.score.left} - ${this.score.right}`;
        }

        if (statusText) {
            if (!this.gameStarted) {
                statusText.textContent = 'Click on left or right side to start playing!';
            } else if (this.ballAttached) {
                if (this.mousePressed) {
                    statusText.textContent = 'Aim with mouse, release to launch!';
                } else {
                    statusText.textContent = 'Click and hold to aim, release to launch!';
                }
            } else {
                const playerSideText = this.playerSide === 'left' ? 'Left' : 'Right';
                statusText.textContent = `Playing as ${playerSideText} paddle - Move mouse to control!`;
            }
        }
    }

    gameLoop() {
        if (!this.gameRunning) return;

        this.update();
        this.render();
        requestAnimationFrame(() => this.gameLoop());
    }
}

// Initialize game when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    checkAuthStatus();
});
