// Global setup for Playwright tests
async function globalSetup() {
    console.log('🚀 Starting test environment setup...');

    // Wait a bit for server to be fully ready
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('✅ Test environment ready');
}

module.exports = globalSetup;