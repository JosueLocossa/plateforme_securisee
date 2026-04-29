const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME     || 'fsaip_db',
  user:     process.env.DB_USER     || 'fsaip_user',
  password: process.env.DB_PASSWORD || '',
});

pool.on('error', (err) => {
  console.error('❌ Erreur PostgreSQL inattendue :', err.message);
});

pool.connect()
  .then(client => {
    console.log('✅ PostgreSQL connecté');
    client.release();
  })
  .catch(err => {
    console.error('❌ Impossible de connecter PostgreSQL :', err.message);
    console.error('   Vérifie que PostgreSQL tourne et que ton .env est correct');
    process.exit(1);
  });

module.exports = pool;
