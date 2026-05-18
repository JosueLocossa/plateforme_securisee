const nodemailer = require('nodemailer');
const fs         = require('fs');
const path       = require('path');
const logger     = require('../utils/logger');

const LOG_DIR  = path.join(__dirname, '../../logs');
fs.mkdirSync(LOG_DIR, { recursive: true });
const EMAIL_LOG = path.join(LOG_DIR, 'emails.log');

// ─────────────────────────────────────────────
// MODE DEV : pas d'envoi réel, juste log
// MODE PROD : envoi via SMTP configuré dans .env
// ─────────────────────────────────────────────
const MODE = process.env.EMAIL_MODE || 'dev';

let transporter = null;

if (MODE === 'prod') {
  transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

const FROM = process.env.EMAIL_FROM || 'noreply@fsaip.fr';

/**
 * Envoie un email (réel ou simulé selon EMAIL_MODE)
 * @param {object} options
 * @param {string} options.to       - Adresse destinataire
 * @param {string} options.subject  - Sujet
 * @param {string} options.text     - Contenu texte brut
 * @param {string} [options.html]   - Contenu HTML (optionnel)
 */
async function sendMail({ to, subject, text, html }) {
  const mail = {
    from:    FROM,
    to,
    subject,
    text,
    html: html || `<pre style="font-family:sans-serif">${text}</pre>`,
  };

  // En dev : log dans fichier + console
  if (MODE === 'dev') {
    const entry = {
      timestamp: new Date().toISOString(),
      mode: 'DEV (simulé)',
      ...mail,
    };

    // Log Winston (apparaît dans la console)
    logger.info('📧 Email simulé', { to, subject });

    // Fichier dédié aux emails (lisible facilement)
    const entryStr =
      `\n────────────────────────────────────────────────\n` +
      `[${entry.timestamp}] EMAIL SIMULÉ (mode dev)\n` +
      `From   : ${entry.from}\n` +
      `To     : ${entry.to}\n` +
      `Subject: ${entry.subject}\n` +
      `────────────────────────────────────────────────\n` +
      `${entry.text}\n`;

    fs.appendFileSync(EMAIL_LOG, entryStr, 'utf8');

    return { simulated: true, to, subject };
  }

  // En prod : envoi réel
  try {
    const info = await transporter.sendMail(mail);
    logger.info('📧 Email envoyé', { to, subject, messageId: info.messageId });
    return { simulated: false, to, subject, messageId: info.messageId };
  } catch (err) {
    logger.error('Erreur envoi email', { to, subject, error: err.message });
    throw err;
  }
}

// ─────────────────────────────────────────────
// Templates utiles pour le module demandes
// ─────────────────────────────────────────────

/**
 * Email de nouvelle demande adressée au destinataire
 */
async function envoyerNotificationNouvelleDemande({
  destinataireEmail,
  destinatairePrenom,
  emetteurNom,
  serviceNom,
  titre,
  description,
  dateLimite,
  typeDemande,
}) {
  const typeLabel = typeDemande === 'remplir_document'
    ? 'remplir et redéposer un document'
    : 'déposer un document';

  const dateLimiteFr = new Date(dateLimite).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  const text =
    `Bonjour ${destinatairePrenom},\n\n` +
    `${emetteurNom} (Service ${serviceNom}) vous demande de ${typeLabel} :\n\n` +
    `📌 Titre  : ${titre}\n` +
    (description ? `📝 Détail : ${description}\n` : '') +
    `\n⏰ Date limite : ${dateLimiteFr}\n\n` +
    `Connectez-vous à la plateforme pour répondre à cette demande :\n` +
    `http://localhost:3000\n\n` +
    `--\nPlateforme Sécurisée FSAIP`;

  return sendMail({
    to: destinataireEmail,
    subject: `[FSAIP] Nouvelle demande : ${titre}`,
    text,
  });
}

/**
 * Email à l'émetteur (et collègues du service) quand un doc est déposé
 */
async function envoyerNotificationDepotReponse({
  emetteurEmail,
  emetteurPrenom,
  destinataireNom,
  titre,
  nomFichier,
}) {
  const text =
    `Bonjour ${emetteurPrenom},\n\n` +
    `${destinataireNom} a déposé un document en réponse à votre demande :\n\n` +
    `📌 Demande : ${titre}\n` +
    `📎 Fichier : ${nomFichier}\n\n` +
    `Connectez-vous à la plateforme pour le consulter :\n` +
    `http://localhost:3000\n\n` +
    `--\nPlateforme Sécurisée FSAIP`;

  return sendMail({
    to: emetteurEmail,
    subject: `[FSAIP] Document déposé : ${titre}`,
    text,
  });
}

module.exports = {
  sendMail,
  envoyerNotificationNouvelleDemande,
  envoyerNotificationDepotReponse,
};