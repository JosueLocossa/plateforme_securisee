require('./config/db'); // initialise et teste la connexion PostgreSQL
const app  = require('./app');
const { demarrerJobPurge } = require('./services/purgeJob');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré → http://localhost:${PORT}`);
  console.log(`   Health check   → http://localhost:${PORT}/health`);

  // Lancer le job de purge des demandes expirées (toutes les heures)
  demarrerJobPurge();
});