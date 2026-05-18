const express = require('express');
const router  = express.Router();
const pool    = require('../config/db');
const { authenticate } = require('../middleware/auth');

// GET /api/services — liste des services (tous les rôles authentifiés)
router.get('/', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, nom, description FROM services ORDER BY nom'
    );
    res.json({ services: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;