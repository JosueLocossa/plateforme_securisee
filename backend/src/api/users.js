const express = require('express');
const router  = express.Router();
const pool    = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { checkRole }    = require('../middleware/rbac');

// GET /api/users — liste des utilisateurs (pour choisir un destinataire)
// Accessible à : admin (tous), administration (destinataires potentiels)
router.get(
  '/',
  authenticate,
  checkRole(['admin', 'administration']),
  async (req, res) => {
    try {
      // Si admin : voit tout le monde
      // Si administration : voit uniquement les destinataires potentiels
      //                     (etudiant_interne, prof, externe)
      let query, params;

      if (req.user.role === 'admin') {
        query = `SELECT u.id, u.email, u.prenom, u.nom, u.role, s.nom AS service
                 FROM utilisateurs u
                 LEFT JOIN services s ON s.id = u.service_id
                 ORDER BY u.role, u.nom`;
        params = [];
      } else {
        // administration : seulement les destinataires possibles
        query = `SELECT u.id, u.email, u.prenom, u.nom, u.role
                 FROM utilisateurs u
                 WHERE u.role IN ('etudiant_interne', 'prof', 'externe')
                 ORDER BY u.role, u.nom`;
        params = [];
      }

      const result = await pool.query(query, params);
      res.json({ utilisateurs: result.rows });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }
);

// GET /api/users/me — infos sur l'utilisateur connecté (pour le frontend)
router.get('/me', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.email, u.prenom, u.nom, u.role, u.service_id, s.nom AS service
       FROM utilisateurs u
       LEFT JOIN services s ON s.id = u.service_id
       WHERE u.id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Utilisateur introuvable' });
    }

    res.json({ utilisateur: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;