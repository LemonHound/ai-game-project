const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

pool
  .connect()
  .then((client) => {
    console.log('✅ Manual connection test passed');
    client.release();
  })
  .catch((err) => {
    console.error('❌ Manual connection test failed:', err.message);
    console.log('Connection config:', {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      passwordLength: process.env.DB_PASSWORD?.length,
    });
  });

pool.on('error', (err) => {
  console.error('❌ Database connection error:', err.message);
});

module.exports = pool;
