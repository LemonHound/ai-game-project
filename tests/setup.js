const pool = require('../src/shared/database/connection');

// Global test setup
beforeAll(async () => {
    // Setup test database if needed
});

afterAll(async () => {
    // Cleanup
    await pool.end();
});