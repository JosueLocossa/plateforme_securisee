const express = require('express');
const router  = express.Router();
const pool    = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { checkRole }    = require('../middleware/rbac');
const { auditLog }     = require('../middleware/auditLog');
const { creerNotification } = require('../services/notifications');

const DELAI_REPONSE_JOURS = 14;

// ============================================
// POST /api/requests — créer une demande
// Réservé : administration uniquement
// ============================================
router.post(
  '/',
  authenticate,
  checkRole(['administration']),
  auditLog('creer_demande'),
  async (req, res) => {
    try {
      const {
        destinataire_id,
        type_demande,
        titre,
        description,
        document_modele_id, // optionnel, seulement si type = remplir_document
      } = req.body;

      // Validations
      if (!destinataire_id || !type_demande || !titre) {
        return res.status(400).json({
          error: 'destinataire_id, type_demande et titre sont requis',
        });
      }
      if (!['upload_simple', 'remplir_document'].includes(type_demande)) {
        return res.status(400).json({
          error: "type_demande doit être 'upload_simple' ou 'remplir_document'",
        });
      }

      // Vérifier que le destinataire est un rôle valide
      const dest = await pool.query(
        `SELECT id, email, prenom, nom, role
         FROM utilisateurs
         WHERE id = $1 AND role IN ('etudiant_interne', 'prof', 'externe')`,
        [destinataire_id]
      );
      if (dest.rows.length === 0) {
        return res.status(400).json({
          error: 'destinataire_id invalide (doit être un étudiant, prof ou externe)',
        });
      }

      // Si type = remplir_document, vérifier que le document modèle existe et appartient à l'émetteur
      if (type_demande === 'remplir_document') {
        if (!document_modele_id) {
          return res.status(400).json({
            error: 'document_modele_id requis pour type_demande=remplir_document',
          });
        }
        const doc = await pool.query(
          'SELECT id FROM documents WHERE id = $1 AND uploader_id = $2',
          [document_modele_id, req.user.id]
        );
        if (doc.rows.length === 0) {
          return res.status(400).json({
            error: 'document_modele_id introuvable ou ne vous appartient pas',
          });
        }
      }

      // Date limite = aujourd'hui + 14 jours
      const dateLimite = new Date();
      dateLimite.setDate(dateLimite.getDate() + DELAI_REPONSE_JOURS);

      // Insertion
      const result = await pool.query(
        `INSERT INTO demandes_documents
         (emetteur_id, service_id, destinataire_id, type_demande,
          titre, description, document_modele_id, date_limite)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          req.user.id,
          req.user.service_id,
          destinataire_id,
          type_demande,
          titre,
          description || null,
          document_modele_id || null,
          dateLimite,
        ]
      );
      const demande = result.rows[0];

      // Récupérer les infos émetteur pour la notif
      const emetteur = await pool.query(
        `SELECT u.prenom, u.nom, s.nom AS service
         FROM utilisateurs u
         LEFT JOIN services s ON s.id = u.service_id
         WHERE u.id = $1`,
        [req.user.id]
      );
      const emetteurInfo = emetteur.rows[0];

      // Notification + email au destinataire
      await creerNotification({
        destinataireId: destinataire_id,
        type: 'nouvelle_demande',
        titre: `Nouvelle demande : ${titre}`,
        message:
          `${emetteurInfo.prenom} ${emetteurInfo.nom} (Service ${emetteurInfo.service}) vous demande de ` +
          (type_demande === 'remplir_document'
            ? 'remplir et redéposer un document.'
            : 'déposer un document.'),
        lienId: demande.id,
        lienType: 'demande',
        emailData: {
          destinataireEmail: dest.rows[0].email,
          destinatairePrenom: dest.rows[0].prenom,
          emetteurNom: `${emetteurInfo.prenom} ${emetteurInfo.nom}`,
          serviceNom: emetteurInfo.service,
          titre,
          description,
          dateLimite,
          typeDemande: type_demande,
        },
      });

      res.status(201).json({
        message: 'Demande créée avec succès',
        demande,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }
);

// ============================================
// GET /api/requests — lister les demandes
// Visibilité :
//   - admin : toutes
//   - administration : celles de son service
//   - autres : celles reçues
// ============================================
router.get(
  '/',
  authenticate,
  auditLog('consulter_demandes'),
  async (req, res) => {
    try {
      let query, params;

      const baseSelect = `
        SELECT d.*,
               e.prenom || ' ' || e.nom AS emetteur_nom,
               e.email AS emetteur_email,
               s.nom AS service_nom,
               r.prenom || ' ' || r.nom AS destinataire_nom,
               r.email AS destinataire_email,
               r.role  AS destinataire_role
        FROM demandes_documents d
        LEFT JOIN utilisateurs e ON e.id = d.emetteur_id
        LEFT JOIN utilisateurs r ON r.id = d.destinataire_id
        LEFT JOIN services    s ON s.id = d.service_id
      `;

      if (req.user.role === 'admin') {
        // admin voit tout
        query = baseSelect + ' ORDER BY d.date_creation DESC';
        params = [];
      } else if (req.user.role === 'administration') {
        // administration voit les demandes de son service
        query = baseSelect + ' WHERE d.service_id = $1 ORDER BY d.date_creation DESC';
        params = [req.user.service_id];
      } else {
        // etudiant_interne / prof / externe : leurs demandes reçues
        query = baseSelect + ' WHERE d.destinataire_id = $1 ORDER BY d.date_creation DESC';
        params = [req.user.id];
      }

      const result = await pool.query(query, params);
      res.json({ demandes: result.rows });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }
);

// ============================================
// GET /api/requests/:id — détail d'une demande + ses docs réponse
// ============================================
router.get(
  '/:id',
  authenticate,
  async (req, res) => {
    try {
      const demande = await getDemandeAvecVisibilite(req.params.id, req.user);
      if (!demande) {
        return res.status(404).json({ error: 'Demande introuvable ou accès refusé' });
      }

      // Récupérer les documents déposés en réponse
      const docs = await pool.query(
        `SELECT id, nom_fichier, type, cree_le, uploader_id
         FROM documents
         WHERE demande_id = $1
         ORDER BY cree_le ASC`,
        [demande.id]
      );

      res.json({ demande, documents_reponse: docs.rows });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }
);

// ============================================
// PATCH /api/requests/:id — modifier une demande
// Réservé : émetteur OU autre membre du même service
// ============================================
router.patch(
  '/:id',
  authenticate,
  checkRole(['administration']),
  auditLog('modifier_demande'),
  async (req, res) => {
    try {
      const demande = await getDemandeAvecVisibilite(req.params.id, req.user);
      if (!demande) {
        return res.status(404).json({ error: 'Demande introuvable ou accès refusé' });
      }

      const { titre, description, date_limite } = req.body;

      const result = await pool.query(
        `UPDATE demandes_documents
         SET titre        = COALESCE($1, titre),
             description  = COALESCE($2, description),
             date_limite  = COALESCE($3, date_limite)
         WHERE id = $4
         RETURNING *`,
        [titre, description, date_limite, req.params.id]
      );

      res.json({ message: 'Demande modifiée', demande: result.rows[0] });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }
);

// ============================================
// DELETE /api/requests/:id — supprimer une demande
// Réservé : émetteur OU autre membre du même service
// CASCADE : docs en réponse + notifs supprimés (FK ON DELETE CASCADE)
// ============================================
router.delete(
  '/:id',
  authenticate,
  checkRole(['administration']),
  auditLog('supprimer_demande'),
  async (req, res) => {
    try {
      const demande = await getDemandeAvecVisibilite(req.params.id, req.user);
      if (!demande) {
        return res.status(404).json({ error: 'Demande introuvable ou accès refusé' });
      }

      // Supprimer les notifications liées (pas de cascade auto sur lien_id)
      await pool.query(
        `DELETE FROM notifications
         WHERE lien_type = 'demande' AND lien_id = $1`,
        [req.params.id]
      );

      // Supprimer la demande (cascade sur docs grâce à la FK)
      await pool.query('DELETE FROM demandes_documents WHERE id = $1', [req.params.id]);

      res.json({ message: 'Demande supprimée (avec cascade)' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }
);

// ─────────────────────────────────────────────
// Helper interne : récupère une demande avec
// vérification de visibilité selon le user
// ─────────────────────────────────────────────
async function getDemandeAvecVisibilite(demandeId, user) {
  const result = await pool.query(
    'SELECT * FROM demandes_documents WHERE id = $1',
    [demandeId]
  );
  if (result.rows.length === 0) return null;

  const demande = result.rows[0];

  if (user.role === 'admin') return demande; // voit tout
  if (user.role === 'administration' && demande.service_id === user.service_id) return demande;
  if (demande.destinataire_id === user.id) return demande;

  return null; // pas le droit
}

module.exports = router;