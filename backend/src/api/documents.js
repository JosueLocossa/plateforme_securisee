const express  = require('express');
const multer   = require('multer');
const router   = express.Router();
const pool     = require('../config/db');
const nas      = require('../services/nas');
const { authenticate } = require('../middleware/auth');
const { checkRole }    = require('../middleware/rbac');
const { auditLog }     = require('../middleware/auditLog');

// Multer : stockage en mémoire (on chiffre avant d'écrire sur disque)
const upload = multer({ storage: multer.memoryStorage() });

// ─────────────────────────────────────────────
// GET /api/documents — liste tous les documents
// ─────────────────────────────────────────────
router.get(
  '/',
  authenticate,
  checkRole(['admin', 'prof', 'scolaire']),
  auditLog('consulter_documents'),
  async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT d.id, d.nom_fichier, d.type, d.cree_le,
                u.prenom || ' ' || u.nom AS uploader
         FROM documents d
         LEFT JOIN utilisateurs u ON u.id = d.uploader_id
         ORDER BY d.cree_le DESC`
      );
      res.json({ documents: result.rows });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }
);

// ─────────────────────────────────────────────
// POST /api/documents/upload — upload + chiffrement
// ─────────────────────────────────────────────
router.post(
  '/upload',
  authenticate,
  checkRole(['admin', 'prof']),
  auditLog('upload_document'),
  upload.single('fichier'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Aucun fichier envoyé' });
      }

      // 1. Chiffrer et sauvegarder sur le NAS
      const cheminNas = nas.saveFile(req.file.buffer, req.file.originalname);

      // 2. Enregistrer les métadonnées en base
      const result = await pool.query(
        `INSERT INTO documents (nom_fichier, type, chemin_nas, chiffre, uploader_id)
         VALUES ($1, $2, $3, true, $4)
         RETURNING id, nom_fichier, cree_le`,
        [req.file.originalname, req.file.mimetype, cheminNas, req.user.id]
      );

      res.status(201).json({
        message:  'Fichier uploadé et chiffré avec succès',
        document: result.rows[0],
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Erreur lors de l'upload" });
    }
  }
);

// ─────────────────────────────────────────────
// GET /api/documents/:id/download — téléchargement déchiffré
// ─────────────────────────────────────────────
router.get(
  '/:id/download',
  authenticate,
  checkRole(['admin', 'prof', 'scolaire']),
  auditLog('telecharger_document'),
  async (req, res) => {
    try {
      const result = await pool.query(
        'SELECT * FROM documents WHERE id = $1',
        [req.params.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Document introuvable' });
      }

      const doc    = result.rows[0];
      const buffer = nas.readFile(doc.chemin_nas); // déchiffre à la volée

      res.setHeader('Content-Disposition', `attachment; filename="${doc.nom_fichier}"`);
      res.setHeader('Content-Type', doc.type || 'application/octet-stream');
      res.send(buffer);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erreur lors du téléchargement' });
    }
  }
);

// ─────────────────────────────────────────────
// DELETE /api/documents/:id — purge (admin only)
// ─────────────────────────────────────────────
router.delete(
  '/:id',
  authenticate,
  checkRole(['admin']),
  auditLog('supprimer_document'),
  async (req, res) => {
    try {
      const result = await pool.query(
        'SELECT * FROM documents WHERE id = $1',
        [req.params.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Document introuvable' });
      }

      nas.deleteFile(result.rows[0].chemin_nas);
      await pool.query('DELETE FROM documents WHERE id = $1', [req.params.id]);

      res.json({ message: 'Document supprimé (purge)' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erreur lors de la suppression' });
    }
  }
);

module.exports = router;
