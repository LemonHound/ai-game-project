const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
});

async function testConnection() {
    try {
        const client = await pool.connect();
        console.log('✅ Database connected successfully!');

        // Test query
        const result = await client.query('SELECT COUNT(*) FROM users');
        console.log(`📊 Users in database: ${result.rows[0].count}`);

        client.release();
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
    } finally {
        await pool.end();
    }
}

testConnection();