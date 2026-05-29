const pool = require('../src/config/db');

// Hook : avant chaque test, on nettoie les tables transactionnelles
beforeEach(async () => {
  await pool.query('DELETE FROM notifications');
  await pool.query('DELETE FROM documents');
  await pool.query('DELETE FROM demandes_documents');
});

// Hook : après tous les tests, on ferme la connexion BDD
afterAll(async () => {
  await pool.end();
});
