const pool = require('../../src/shared/database/connection');

describe('Smoke Tests', () => {
    it('should connect to database', async () => {
        const client = await pool.connect();
        const result = await client.query('SELECT NOW()');
        expect(result.rows).toHaveLength(1);
        client.release();
    });

    it('should load main modules', () => {
        expect(() => require('../../src/backend/server')).not.toThrow();
    });
});