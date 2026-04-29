require('./config/db'); // initialise et teste la connexion PostgreSQL
const app  = require('./app');
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré → http://localhost:${PORT}`);
  console.log(`   Health check   → http://localhost:${PORT}/health`);
});
