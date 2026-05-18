const pool   = require('../config/db');
const mailer = require('./mailer');
const logger = require('../utils/logger');

/**
 * Crée une notification in-app + envoie un email associé
 *
 * @param {object} options
 * @param {number} options.destinataireId - id de l'utilisateur destinataire
 * @param {string} options.type           - 'nouvelle_demande' | 'depot_reponse' | ...
 * @param {string} options.titre          - titre de la notif
 * @param {string} [options.message]      - corps du message
 * @param {number} [options.lienId]       - id de la ressource liée
 * @param {string} [options.lienType]     - type de ressource liée ('demande', etc.)
 * @param {object} [options.emailData]    - données pour le template email
 */
async function creerNotification({
  destinataireId,
  type,
  titre,
  message = null,
  lienId = null,
  lienType = null,
  emailData = null,
}) {
  try {
    // 1. Insertion notification in-app
    const result = await pool.query(
      `INSERT INTO notifications
       (destinataire_id, type, titre, message, lien_id, lien_type)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [destinataireId, type, titre, message, lienId, lienType]
    );

    const notificationId = result.rows[0].id;
    logger.info('🔔 Notification créée', { notificationId, type, destinataireId });

    // 2. Envoi email selon le type
    if (emailData) {
      await envoyerEmailSelonType(type, emailData);
    }

    return notificationId;
  } catch (err) {
    logger.error('Erreur création notification', { type, destinataireId, error: err.message });
    throw err;
  }
}

/**
 * Route vers le bon template email selon le type de notification
 */
async function envoyerEmailSelonType(type, data) {
  try {
    switch (type) {
      case 'nouvelle_demande':
        await mailer.envoyerNotificationNouvelleDemande(data);
        break;
      case 'depot_reponse':
        await mailer.envoyerNotificationDepotReponse(data);
        break;
      default:
        logger.warn('Type de notification sans template email', { type });
    }
  } catch (err) {
    logger.error('Erreur envoi email notification', { type, error: err.message });
    // Ne pas faire échouer la création de notif si l'email échoue
  }
}

/**
 * Compte les notifications non lues d'un utilisateur
 */
async function compterNonLues(utilisateurId) {
  const result = await pool.query(
    'SELECT COUNT(*)::int AS total FROM notifications WHERE destinataire_id = $1 AND lue = false',
    [utilisateurId]
  );
  return result.rows[0].total;
}

module.exports = {
  creerNotification,
  compterNonLues,
};