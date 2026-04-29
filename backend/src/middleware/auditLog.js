const fs   = require('fs');
const path = require('path');
const pool = require('../config/db');

const auditLog = (action) => {
  return async (req, res, next) => {
    const entry = {
      timestamp: new Date().toISOString(),
      userId:    req.user?.id   || null,
      role:      req.user?.role || 'inconnu',
      action,
      ip:        req.ip,
      path:      req.path,
    };

    // 1. Fichier log append-only
    const logPath = path.join(__dirname, '../../logs/audit.log');
    fs.appendFileSync(logPath, JSON.stringify(entry) + '\n');

    // 2. Base PostgreSQL (immuable via règles SQL)
    try {
      await pool.query(
        `INSERT INTO audit_logs (utilisateur_id, action, detail, ip)
         VALUES ($1, $2, $3, $4)`,
        [entry.userId, action, JSON.stringify({ path: entry.path }), entry.ip]
      );
    } catch (err) {
      console.error('Erreur audit log DB :', err.message);
    }

    next();
  };
};

module.exports = { auditLog };
