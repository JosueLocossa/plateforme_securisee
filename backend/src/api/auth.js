const express = require('express');
const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcryptjs');
const pool    = require('../config/db');
const logger  = require('../utils/logger');
const router  = express.Router();
require('dotenv').config();

// ─────────────────────────────────────────────
// POST /api/auth/login
// Corps JSON : { "email": "...", "password": "..." }
// Authentification réelle par bcrypt
// ─────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const startTime = Date.now();

  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'email et password sont requis' });
    }

    // Recherche utilisateur (avec son service éventuel)
    const result = await pool.query(
      `SELECT u.id, u.email, u.prenom, u.nom, u.role, u.service_id,
              u.password_hash, s.nom AS service
       FROM utilisateurs u
       LEFT JOIN services s ON s.id = u.service_id
       WHERE u.email = $1`,
      [email]
    );

    const user = result.rows[0];

    // ─── Anti timing attack ────────────────────────────────────
    // On fait TOUJOURS un bcrypt.compare, qu'on ait trouvé l'utilisateur ou non
    // → impossible de deviner par le timing si l'email existe en base
    const fakeHash = '$2a$12$invalidhashinvalidhashinvalidhashinvalidhashinvalidhash';
    const hashAComparer = (user && user.password_hash) || fakeHash;

    const passwordOk = await bcrypt.compare(password, hashAComparer);

    if (!user || !user.password_hash || !passwordOk) {
      // ─── Délai constant minimum (250 ms) ───────────────────
      // Ralentit le brute-force et homogénéise les temps de réponse
      const elapsed = Date.now() - startTime;
      if (elapsed < 250) await new Promise(r => setTimeout(r, 250 - elapsed));

      logger.warn('Échec login', { email, ip: req.ip });
      return res.status(401).json({ error: 'Identifiants invalides' });
    }

    // ─── Construire le payload JWT ─────────────────────────────
    const payload = {
      id:         user.id,
      email:      user.email,
      role:       user.role,
      service_id: user.service_id,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '8h' });

    logger.info('Login réussi', {
      user_id: user.id,
      email: user.email,
      role: user.role,
    });

    res.json({
      message: 'Connecté',
      token,
      user: {
        id:      user.id,
        email:   user.email,
        prenom:  user.prenom,
        nom:     user.nom,
        role:    user.role,
        service: user.service,
      },
    });
  } catch (err) {
    logger.error('Erreur login', { error: err.message });
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;