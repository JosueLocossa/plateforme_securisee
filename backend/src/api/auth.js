const express = require('express');
const jwt     = require('jsonwebtoken');
const router  = express.Router();
require('dotenv').config();

// POST /api/auth/login
// Corps JSON : { "email": "test@fsaip.fr", "role": "admin" }
// SAML M365 sera branché plus tard — ceci est le placeholder JWT pour le POC
router.post('/login', (req, res) => {
  const { email, role } = req.body;

  if (!email || !role) {
    return res.status(400).json({ error: 'email et role sont requis' });
  }

  const rolesValides = ['admin', 'prof', 'scolaire', 'invite'];
  if (!rolesValides.includes(role)) {
    return res.status(400).json({
      error: `Rôle invalide. Valeurs acceptées : ${rolesValides.join(', ')}`
    });
  }

  const token = jwt.sign(
    { id: 1, email, role },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );

  res.json({ message: 'Connecté (mode POC)', token });
});

module.exports = router;
