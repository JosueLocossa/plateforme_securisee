const express = require('express');
const router  = express.Router();
const pool    = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { compterNonLues } = require('../services/notifications');

// ─────────────────────────────────────────────
// GET /api/notifications — liste mes notifications
// ─────────────────────────────────────────────
router.get('/', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, type, titre, message, lien_id, lien_type, lue, cree_le
       FROM notifications
       WHERE destinataire_id = $1
       ORDER BY cree_le DESC
       LIMIT 50`,
      [req.user.id]
    );

    const nonLues = await compterNonLues(req.user.id);

    res.json({
      notifications: result.rows,
      non_lues: nonLues,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─────────────────────────────────────────────
// PATCH /api/notifications/:id/read — marquer comme lue
// ─────────────────────────────────────────────
router.patch('/:id/read', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE notifications
       SET lue = true
       WHERE id = $1 AND destinataire_id = $2
       RETURNING id`,
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notification introuvable' });
    }

    res.json({ message: 'Notification marquée comme lue', id: result.rows[0].id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─────────────────────────────────────────────
// PATCH /api/notifications/read-all — tout marquer comme lu
// ─────────────────────────────────────────────
router.patch('/read-all', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE notifications
       SET lue = true
       WHERE destinataire_id = $1 AND lue = false`,
      [req.user.id]
    );

    res.json({
      message: 'Toutes les notifications marquées comme lues',
      affected: result.rowCount,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;