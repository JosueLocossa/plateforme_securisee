const express = require('express');
const router  = express.Router();
const pool    = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { checkRole }    = require('../middleware/rbac');

// GET /api/audit — liste l'audit log (admin uniquement)
router.get(
  '/',
  authenticate,
  checkRole(['admin']),
  async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT a.id, a.action, a.type_ressource, a.ressource_id, a.cree_le,
                u.email
         FROM audit_log a
         LEFT JOIN utilisateurs u ON u.id = a.utilisateur_id
         ORDER BY a.cree_le DESC
         LIMIT 100`
      );
      res.json({ logs: result.rows });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }
);

module.exports = router;