describe('Smoke Tests', () => {
    let pool;

    beforeAll(() => {
        // Load environment variables
        require('dotenv').config();
        pool = require('../../src/shared/database/connection');
    });

    afterAll(async () => {
        // Clean up database connections
        if (pool && pool.end) {
            try {
                await pool.end();
            } catch (error) {
                // Ignore cleanup errors
            }
        }
    });

    it('should connect to database', async () => {
        // Check if database is configured
        const dbConfigured =
            process.env.DB_HOST &&
            process.env.DB_USER &&
            process.env.DB_PASSWORD &&
            process.env.DB_NAME;

        if (!dbConfigured) {
            console.warn('Database not configured - skipping database test');
            expect(true).toBe(true);
            return;
        }

        try {
            const client = await pool.connect();
            const result = await client.query('SELECT NOW()');
            expect(result.rows).toHaveLength(1);
            expect(result.rows[0]).toHaveProperty('now');
            client.release();
            console.log('✅ Database connection test passed');
        } catch (error) {
            console.error('❌ Database connection failed:', error.message);
            // Fail the test if DB is configured but connection fails
            throw error;
        }
    });

    it('should load main modules without starting server', () => {
        // Test that we can import modules without starting the server
        expect(() => {
            const express = require('express');
            const cors = require('cors');
            const helmet = require('helmet');
            const morgan = require('morgan');
            const path = require('path');
        }).not.toThrow();
    });

    it('should have required environment setup', () => {
        // Test basic environment
        expect(process.env.NODE_ENV).toBeDefined();
        expect(typeof require('../../package.json').name).toBe('string');
        expect(require('../../package.json').name).toBe('aigamewebsite');
    });

    it('should have database connection module', () => {
        // Test that database connection module loads
        expect(() => {
            const dbConnection = require('../../src/shared/database/connection');
            expect(dbConnection).toBeDefined();
            expect(typeof dbConnection.connect).toBe('function');
        }).not.toThrow();
    });
});
