const express = require('express');
const jwt     = require('jsonwebtoken');
const pool    = require('../config/db');
const router  = express.Router();
require('dotenv').config();

const ROLES_VALIDES = [
  'admin',
  'administration',
  'etudiant_interne',
  'prof',
  'externe',
];

// ─────────────────────────────────────────────
// POST /api/auth/login
// Corps JSON : { "email": "...", "role": "..." }
// Mock POC : on vérifie juste que l'utilisateur existe en base
// et que le rôle fourni correspond bien.
// SAML M365 sera branché plus tard.
// ─────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, role } = req.body;

    if (!email || !role) {
      return res.status(400).json({ error: 'email et role sont requis' });
    }

    if (!ROLES_VALIDES.includes(role)) {
      return res.status(400).json({
        error: `Rôle invalide. Valeurs acceptées : ${ROLES_VALIDES.join(', ')}`,
      });
    }

    // Récupérer l'utilisateur en base
    const result = await pool.query(
      `SELECT u.id, u.email, u.prenom, u.nom, u.role, u.service_id, s.nom AS service
       FROM utilisateurs u
       LEFT JOIN services s ON s.id = u.service_id
       WHERE u.email = $1`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Utilisateur introuvable' });
    }

    const user = result.rows[0];

    // Vérifier que le rôle fourni correspond bien (anti-spoofing)
    if (user.role !== role) {
      return res.status(403).json({
        error: `Le rôle '${role}' ne correspond pas à l'utilisateur (rôle réel : '${user.role}')`,
      });
    }

    // Construire le payload JWT avec les VRAIES infos de l'utilisateur
    const payload = {
      id:         user.id,
      email:      user.email,
      role:       user.role,
      service_id: user.service_id,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '8h' });

    res.json({
      message: 'Connecté (mode POC)',
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
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;