// Exécuté après TOUS les tests
module.exports = async () => {
  // Petite pause pour laisser le pool finir ses requêtes
  await new Promise(resolve => setTimeout(resolve, 500));
};
