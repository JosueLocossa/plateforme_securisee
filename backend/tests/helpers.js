const request = require('supertest');
const bcrypt  = require('bcryptjs');
const pool    = require('../src/config/db');
const app     = require('../src/app');

// Mots de passe seedés avant les tests
const MDP_TEST = {
  'admin@fsaip.fr':              'admin123',
  'marie.scolarite@fsaip.fr':    'marie123',
  'anne.scolarite@fsaip.fr':     'anne123',
  'paul.compta@fsaip.fr':        'paul123',
  'sophie.compta@fsaip.fr':      'sophie123',
  'josue.etudiant@fsaip.fr':     'josue123',
  'professeur@fsaip.fr':         'prof123',
  'externe@fsaip.fr':            'externe123',
};

/**
 * Seed les mots de passe bcrypt dans la base de test
 * (appelée une fois avant tous les tests)
 */
async function seedPasswords() {
  for (const [email, motDePasse] of Object.entries(MDP_TEST)) {
    const hash = await bcrypt.hash(motDePasse, 12);
    await pool.query(
      'UPDATE utilisateurs SET password_hash = $1 WHERE email = $2',
      [hash, email]
    );
  }
}

/**
 * Login un utilisateur et retourne son token + ses infos
 */
async function login(email) {
  const password = MDP_TEST[email];
  if (!password) throw new Error(`Pas de mot de passe pour ${email}`);

  const res = await request(app)
    .post('/api/auth/login')
    .send({ email, password });

  if (res.status !== 200) {
    throw new Error(`Login échec pour ${email}: ${res.body.error}`);
  }
  return { token: res.body.token, user: res.body.user };
}

/**
 * Header Authorization prêt à l'emploi
 */
function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

module.exports = { seedPasswords, login, authHeader, MDP_TEST, app };
