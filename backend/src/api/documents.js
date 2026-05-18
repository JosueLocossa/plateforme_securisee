const express  = require('express');
const multer   = require('multer');
const router   = express.Router();
const pool     = require('../config/db');
const nas      = require('../services/nas');
const { authenticate } = require('../middleware/auth');
const { checkRole }    = require('../middleware/rbac');
const { auditLog }     = require('../middleware/auditLog');
const { validateUpload, TAILLE_MAX } = require('../middleware/validateUpload');
const { creerNotification } = require('../services/notifications');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TAILLE_MAX },
});

// ============================================
// GET /api/documents — liste selon le rôle
// ============================================
router.get(
  '/',
  authenticate,
  auditLog('consulter_documents'),
  async (req, res) => {
    try {
      const user = req.user;
      let query, params;

      const baseSelect = `
        SELECT d.id, d.nom_fichier, d.type, d.cree_le, d.uploader_id,
               d.demande_id,
               u.prenom || ' ' || u.nom AS uploader_nom,
               dem.titre AS demande_titre,
               dem.service_id AS demande_service_id,
               CASE
                 WHEN d.id = dem.document_modele_id THEN 'modele'
                 WHEN d.demande_id IS NOT NULL THEN 'reponse'
                 ELSE 'autre'
               END AS contexte
        FROM documents d
        LEFT JOIN utilisateurs u ON u.id = d.uploader_id
        LEFT JOIN demandes_documents dem ON dem.id = d.demande_id
      `;

      if (user.role === 'admin') {
        // admin : voit tout
        query = baseSelect + ' ORDER BY d.cree_le DESC';
        params = [];
      } else if (user.role === 'administration') {
        // administration : ses uploads + docs réponse des demandes de son service
        query = baseSelect + `
          WHERE d.uploader_id = $1
             OR dem.service_id = $2
          ORDER BY d.cree_le DESC`;
        params = [user.id, user.service_id];
      } else {
        // etudiant_interne / prof / externe : ses uploads + modèles reçus
        query = baseSelect + `
          WHERE d.uploader_id = $1
             OR (d.id = dem.document_modele_id AND dem.destinataire_id = $1)
          ORDER BY d.cree_le DESC`;
        params = [user.id];
      }

      const result = await pool.query(query, params);
      res.json({ documents: result.rows });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }
);

// ============================================
// POST /api/documents/upload — upload + AES-256-GCM
// Règles :
//   - admin : INTERDIT
//   - administration : autorisé uniquement pour un "document modèle"
//   - etudiant_interne / prof / externe : autorisé uniquement en réponse à une demande qui leur est adressée
// ============================================
router.post(
  '/upload',
  authenticate,
  checkRole(['administration', 'etudiant_interne', 'prof', 'externe']),
  upload.single('fichier'),
  validateUpload,
  auditLog('upload_document'),
  async (req, res) => {
    try {
      const user = req.user;
      const { demande_id, is_modele } = req.body;

      let demandeAssociee = null;

      // ───────────────────────────────────────
      // RÈGLE : administration — uniquement doc modèle
      // ───────────────────────────────────────
      if (user.role === 'administration') {
        if (is_modele !== 'true' && is_modele !== true) {
          return res.status(403).json({
            error: "L'administration ne peut uploader qu'un document modèle (is_modele=true).",
          });
        }
        // OK : c'est un doc modèle pour préparer une demande
      }

      // ───────────────────────────────────────
      // RÈGLE : etudiant_interne / prof / externe — uniquement en réponse à une demande
      // ───────────────────────────────────────
      else if (['etudiant_interne', 'prof', 'externe'].includes(user.role)) {
        if (!demande_id) {
          return res.status(400).json({
            error: 'demande_id requis : l\'upload doit être lié à une demande qui vous est adressée',
          });
        }

        // Vérifier que la demande existe et concerne bien cet utilisateur
        const dem = await pool.query(
          `SELECT * FROM demandes_documents
           WHERE id = $1 AND destinataire_id = $2`,
          [demande_id, user.id]
        );
        if (dem.rows.length === 0) {
          return res.status(403).json({
            error: 'Cette demande ne vous est pas adressée ou n\'existe pas',
          });
        }
        demandeAssociee = dem.rows[0];
      }

      // ───────────────────────────────────────
      // Chiffrement + sauvegarde NAS
      // ───────────────────────────────────────
      const { cheminNas, uuid, iv, authTag } = nas.saveFile(req.file.buffer);

      const result = await pool.query(
        `INSERT INTO documents
         (nom_fichier, type, taille_octets, chemin_nas, chiffre, uploader_id,
          uuid_fichier, iv, auth_tag, algorithme, demande_id)
         VALUES ($1, $2, $3, $4, true, $5, $6, $7, $8, 'aes-256-gcm', $9)
         RETURNING id, nom_fichier, cree_le`,
        [
          req.file.originalname,
          req.file.mimetype,
          req.file.size,
          cheminNas,
          user.id,
          uuid,
          iv,
          authTag,
          demande_id || null,
        ]
      );
      const doc = result.rows[0];

      // ───────────────────────────────────────
      // Si c'est une réponse à une demande : passer la demande en "fait" + notifier l'émetteur
      // ───────────────────────────────────────
      if (demandeAssociee) {
        // Update demande : statut + date de première réponse si pas déjà
        await pool.query(
          `UPDATE demandes_documents
           SET statut = 'fait',
               date_reponse = COALESCE(date_reponse, CURRENT_TIMESTAMP)
           WHERE id = $1`,
          [demandeAssociee.id]
        );

        // Notification + email à l'émetteur (+ on pourrait notifier tout le service)
        const emetteur = await pool.query(
          `SELECT u.email, u.prenom, u.nom
           FROM utilisateurs u
           WHERE u.id = $1`,
          [demandeAssociee.emetteur_id]
        );
        const e = emetteur.rows[0];

        await creerNotification({
          destinataireId: demandeAssociee.emetteur_id,
          type: 'depot_reponse',
          titre: `Document déposé : ${demandeAssociee.titre}`,
          message: `${user.email} a déposé "${req.file.originalname}" en réponse à votre demande.`,
          lienId: demandeAssociee.id,
          lienType: 'demande',
          emailData: {
            emetteurEmail: e.email,
            emetteurPrenom: e.prenom,
            destinataireNom: user.email,
            titre: demandeAssociee.titre,
            nomFichier: req.file.originalname,
          },
        });
      }

      res.status(201).json({
        message: 'Fichier uploadé et chiffré (AES-256-GCM) avec succès',
        document: doc,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Erreur lors de l'upload" });
    }
  }
);

// ============================================
// GET /api/documents/:id/download — téléchargement
// Règles :
//   - admin : INTERDIT (confidentialité)
//   - administration : peut télécharger les docs liés aux demandes de son service
//   - autres : leurs propres uploads + les modèles reçus
// ============================================
router.get(
  '/:id/download',
  authenticate,
  auditLog('telecharger_document'),
  async (req, res) => {
    try {
      const user = req.user;

      // RÈGLE : admin INTERDIT
      if (user.role === 'admin') {
        return res.status(403).json({
          error: 'Accès refusé : confidentialité. Les admins ne téléchargent pas.',
        });
      }

      const result = await pool.query(
        `SELECT d.*, dem.service_id AS demande_service_id,
                dem.destinataire_id AS demande_destinataire_id,
                dem.document_modele_id AS demande_document_modele_id
         FROM documents d
         LEFT JOIN demandes_documents dem ON dem.id = d.demande_id
         WHERE d.id = $1`,
        [req.params.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Document introuvable' });
      }

      const doc = result.rows[0];

      // Vérification d'accès
      let autorise = false;

      // Cas 1 : c'est mon propre upload
      if (doc.uploader_id === user.id) autorise = true;

      // Cas 2 : administration et le doc est lié à une demande de mon service
      else if (
        user.role === 'administration' &&
        doc.demande_service_id === user.service_id
      ) autorise = true;

      // Cas 3 : c'est un document modèle d'une demande qui m'est adressée
      // (récupéré séparément car le modèle n'a pas forcément d.demande_id rempli)
      else if (['etudiant_interne', 'prof', 'externe'].includes(user.role)) {
        const modele = await pool.query(
          `SELECT 1 FROM demandes_documents
           WHERE document_modele_id = $1 AND destinataire_id = $2`,
          [doc.id, user.id]
        );
        if (modele.rows.length > 0) autorise = true;
      }

      if (!autorise) {
        return res.status(403).json({ error: 'Accès refusé à ce document' });
      }

      // Déchiffrement
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

// ============================================
// DELETE /api/documents/:id — purge
// Réservé : admin uniquement
// ============================================
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