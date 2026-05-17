const winston = require('winston');
const path    = require('path');
const fs      = require('fs');

const LOG_DIR = path.join(__dirname, '../../logs');
fs.mkdirSync(LOG_DIR, { recursive: true });

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    // Console pour le dev
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
    // Fichier append-only en JSON
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'audit.log'),
      level: 'info',
    }),
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'errors.log'),
      level: 'error',
    }),
  ],
});

module.exports = logger;