class App {
    constructor() {
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.showStatus('✅ Frontend loaded successfully!', 'success');
    }

    setupEventListeners() {
        document.getElementById('test-server').addEventListener('click', () => {
            this.testServer();
        });

        document.getElementById('test-database').addEventListener('click', () => {
            this.testDatabase();
        });
    }

    async testServer() {
        try {
            this.showStatus('🔄 Testing server...', 'info');
            const response = await fetch('/api/health');
            const data = await response.json();
            this.showStatus(`✅ ${data.message}`, 'success');
        } catch (error) {
            this.showStatus(`❌ Server test failed: ${error.message}`, 'error');
        }
    }

    async testDatabase() {
        try {
            this.showStatus('🔄 Testing database...', 'info');
            const response = await fetch('/api/test-db');
            const data = await response.json();
            this.showStatus(`✅ ${data.status} Users: ${data.userCount}`, 'success');
        } catch (error) {
            this.showStatus(`❌ Database test failed: ${error.message}`, 'error');
        }
    }

    showStatus(message, type) {
        const statusDiv = document.getElementById('status');
        const messageSpan = document.getElementById('status-message');

        statusDiv.className = `alert alert-${type}`;
        messageSpan.textContent = message;
        statusDiv.classList.remove('hidden');

        // Auto-hide after 5 seconds
        setTimeout(() => {
            statusDiv.classList.add('hidden');
        }, 5000);
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new App();
});