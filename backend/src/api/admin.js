const express = require('express');
const router  = express.Router();
const { authenticate } = require('../middleware/auth');
const { checkRole }    = require('../middleware/rbac');
const { auditLog }     = require('../middleware/auditLog');
const { purgerDemandesExpirees } = require('../services/purgeJob');

// ============================================
// POST /api/admin/purge — déclencher manuellement la purge
// Réservé : admin uniquement
// ============================================
router.post(
  '/purge',
  authenticate,
  checkRole(['admin']),
  auditLog('purge_manuelle'),
  async (req, res) => {
    try {
      const result = await purgerDemandesExpirees();
      res.json({
        message: 'Purge des demandes expirées terminée',
        ...result,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erreur lors de la purge' });
    }
  }
);

module.exports = router;