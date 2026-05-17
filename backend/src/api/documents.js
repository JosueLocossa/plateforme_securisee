const express  = require('express');
const multer   = require('multer');
const router   = express.Router();
const pool     = require('../config/db');
const nas      = require('../services/nas');
const { authenticate } = require('../middleware/auth');
const { checkRole }    = require('../middleware/rbac');
const { auditLog }     = require('../middleware/auditLog');
const { validateUpload, TAILLE_MAX } = require('../middleware/validateUpload');

// Multer mémoire avec limite taille (refuse avant validation)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TAILLE_MAX },
});

// ─────────────────────────────────────────────
// GET /api/documents — liste
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
// POST /api/documents/upload — upload + AES-256-GCM
// ─────────────────────────────────────────────
router.post(
  '/upload',
  authenticate,
  checkRole(['admin', 'prof']),
  upload.single('fichier'),
  validateUpload,
  auditLog('upload_document'),
  async (req, res) => {
    try {
      // 1. Chiffrer + sauvegarder sur le NAS (AES-256-GCM)
      const { cheminNas, uuid, iv, authTag } = nas.saveFile(req.file.buffer);

      // 2. Métadonnées en BDD
      const result = await pool.query(
        `INSERT INTO documents
         (nom_fichier, type, taille_octets, chemin_nas, chiffre, uploader_id,
          uuid_fichier, iv, auth_tag, algorithme)
         VALUES ($1, $2, $3, $4, true, $5, $6, $7, $8, 'aes-256-gcm')
         RETURNING id, nom_fichier, cree_le`,
        [req.file.originalname, req.file.mimetype, req.file.size,
         cheminNas, req.user.id, uuid, iv, authTag]
      );

      res.status(201).json({
        message:  'Fichier uploadé et chiffré (AES-256-GCM) avec succès',
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

      const doc = result.rows[0];

      // Déchiffrement avec IV + auth tag stockés
      const buffer = nas.readFile(doc.chemin_nas, doc.iv, doc.auth_tag);

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
// DELETE /api/documents/:id — purge admin
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