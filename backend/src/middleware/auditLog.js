const crypto = require('crypto');
const pool   = require('../config/db');
const logger = require('../utils/logger');

/**
 * Calcule le SHA-256 d'une chaîne
 */
function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

/**
 * Récupère le hash de la dernière entrée audit (pour le chaînage)
 */
async function getLastHash() {
  const result = await pool.query(
    `SELECT current_hash FROM audit_log
     WHERE current_hash IS NOT NULL
     ORDER BY id DESC LIMIT 1`
  );
  return result.rows[0]?.current_hash || 'GENESIS';
}

/**
 * Middleware factory pour tracer une action
 * @param {string} action - Nom de l'action (ex: 'upload_document')
 */
function auditLog(action) {
  return async (req, res, next) => {
    // On capture la fin de la requête pour logger le résultat
    const originalSend = res.send;
    res.send = function (body) {
      logAction(req, res, action, body).catch(err =>
        logger.error('Erreur écriture audit log', { err: err.message })
      );
      return originalSend.call(this, body);
    };
    next();
  };
}

async function logAction(req, res, action, body) {
  const userId       = req.user?.id || null;
  const userEmail    = req.user?.email || 'anonymous';
  const ip           = req.ip || req.connection?.remoteAddress || 'unknown';
  const success      = res.statusCode < 400;
  const level        = success ? 'INFO' : 'WARN';
  const result       = success ? 'SUCCESS' : 'FAILURE';
  const typeRes      = req.baseUrl?.replace('/api/', '') || null;
  const resourceId   = req.params?.id ? parseInt(req.params.id) : null;

  // Construire l'événement
  const event = {
    timestamp: new Date().toISOString(),
    level,
    event: action,
    user_id: userId,
    user_email: userEmail,
    ip,
    method: req.method,
    path: req.originalUrl,
    status_code: res.statusCode,
    result,
    type_ressource: typeRes,
    ressource_id: resourceId,
  };

  // Hash chaîné — on signe l'événement avec le hash précédent
  const prevHash    = await getLastHash();
  const eventStr    = JSON.stringify(event) + prevHash;
  const currentHash = sha256(eventStr);

  // Log dans Winston (fichier + console)
  logger.log(level.toLowerCase(), action, { ...event, prev_hash: prevHash, current_hash: currentHash });

  // Persister en BDD (immuable grâce aux rules SQL)
  await pool.query(
    `INSERT INTO audit_log
     (utilisateur_id, action, type_ressource, ressource_id, adresse_ip,
      details, event, level, result, prev_hash, current_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [userId, action, typeRes, resourceId, ip,
     JSON.stringify(event), action, level, result, prevHash, currentHash]
  );
}

module.exports = { auditLog };