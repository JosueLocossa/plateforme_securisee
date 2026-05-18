const cron   = require('node-cron');
const pool   = require('../config/db');
const nas    = require('./nas');
const logger = require('../utils/logger');

/**
 * Purge les demandes expirées (date_limite passée).
 * Cascade :
 *   - Suppression des documents liés (NAS + BDD)
 *   - Suppression des notifications liées
 *   - Suppression de la demande elle-même
 *
 * @returns {Promise<{demandes_supprimees: number, documents_supprimes: number}>}
 */
async function purgerDemandesExpirees() {
  logger.info('🧹 Job de purge — démarrage');

  let demandesSupprimees = 0;
  let documentsSupprimes = 0;

  try {
    // 1. Trouver les demandes expirées
    const demandesExpirees = await pool.query(
      `SELECT id, titre
       FROM demandes_documents
       WHERE date_limite < CURRENT_TIMESTAMP`
    );

    if (demandesExpirees.rows.length === 0) {
      logger.info('🧹 Job de purge — aucune demande expirée');
      return { demandes_supprimees: 0, documents_supprimes: 0 };
    }

    logger.info(`🧹 ${demandesExpirees.rows.length} demande(s) expirée(s) trouvée(s)`);

    // 2. Pour chaque demande expirée, récupérer ses documents associés (modèle + réponses)
    for (const demande of demandesExpirees.rows) {
      // Modèle + réponses : tout doc lié à cette demande
      // (soit via demande_id, soit comme document_modele_id)
      const docsLies = await pool.query(
        `SELECT DISTINCT d.id, d.chemin_nas, d.nom_fichier
         FROM documents d
         LEFT JOIN demandes_documents dem ON dem.document_modele_id = d.id
         WHERE d.demande_id = $1 OR dem.id = $1`,
        [demande.id]
      );

      // 3. Supprimer physiquement les fichiers chiffrés du NAS
      for (const doc of docsLies.rows) {
        try {
          nas.deleteFile(doc.chemin_nas);
          documentsSupprimes++;
          logger.info('🗑️ Fichier NAS supprimé', {
            demande_id: demande.id,
            doc_id: doc.id,
            chemin: doc.chemin_nas,
          });
        } catch (err) {
          logger.warn('⚠️ Échec suppression fichier NAS', {
            chemin: doc.chemin_nas,
            error: err.message,
          });
        }
      }

      // 4. Supprimer les notifications liées (la FK n'a pas de cascade automatique)
      await pool.query(
        `DELETE FROM notifications
         WHERE lien_type = 'demande' AND lien_id = $1`,
        [demande.id]
      );

      // 5. Supprimer la demande (cascade automatique sur documents.demande_id)
      await pool.query('DELETE FROM demandes_documents WHERE id = $1', [demande.id]);

      demandesSupprimees++;
      logger.info('🗑️ Demande expirée purgée', {
        demande_id: demande.id,
        titre: demande.titre,
      });
    }

    logger.info('🧹 Job de purge — terminé', {
      demandes_supprimees: demandesSupprimees,
      documents_supprimes: documentsSupprimes,
    });

    return {
      demandes_supprimees: demandesSupprimees,
      documents_supprimes: documentsSupprimes,
    };
  } catch (err) {
    logger.error('Erreur job de purge', { error: err.message });
    throw err;
  }
}

/**
 * Démarre le job en arrière-plan (une fois par heure)
 * Cron format : "minute heure jour mois jour_semaine"
 * "0 * * * *" = toutes les heures à la minute 0
 */
function demarrerJobPurge() {
  // Tâche planifiée
  cron.schedule('0 * * * *', () => {
    purgerDemandesExpirees().catch(err =>
      logger.error('Erreur planifiée du job de purge', { error: err.message })
    );
  });

  logger.info('⏰ Job de purge planifié : toutes les heures');
}

module.exports = {
  purgerDemandesExpirees, // exécution manuelle
  demarrerJobPurge,       // démarrage planifié
};