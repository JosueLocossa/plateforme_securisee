require('dotenv').config({ path: __dirname + '/../.env' });
const bcrypt = require('bcryptjs');
const pool   = require('../src/config/db');

// Mots de passe par défaut pour les comptes de test
// Format : email -> mot de passe en clair
const COMPTES_TEST = {
  'admin@fsaip.fr':              'admin123',
  'marie.scolarite@fsaip.fr':    'marie123',
  'anne.scolarite@fsaip.fr':     'anne123',
  'paul.compta@fsaip.fr':        'paul123',
  'sophie.compta@fsaip.fr':      'sophie123',
  'josue.etudiant@fsaip.fr':     'josue123',
  'professeur@fsaip.fr':         'prof123',
  'externe@fsaip.fr':            'externe123',
};

const COST_FACTOR = 12; // conforme au doc d'archi

(async () => {
  try {
    console.log('🔐 Génération et insertion des mots de passe bcrypt...\n');

    for (const [email, motDePasse] of Object.entries(COMPTES_TEST)) {
      const hash = await bcrypt.hash(motDePasse, COST_FACTOR);

      const result = await pool.query(
        `UPDATE utilisateurs
         SET password_hash = $1
         WHERE email = $2
         RETURNING id, email, role`,
        [hash, email]
      );

      if (result.rows.length === 0) {
        console.warn(`⚠️  Utilisateur introuvable : ${email}`);
      } else {
        console.log(`✅ ${email.padEnd(35)} → mot de passe : ${motDePasse}`);
      }
    }

    console.log('\n🎯 Tous les mots de passe ont été hashés et stockés.');
    console.log('   Cost factor bcrypt : ' + COST_FACTOR);
    process.exit(0);
  } catch (err) {
    console.error('❌ Erreur :', err.message);
    process.exit(1);
  }
})();