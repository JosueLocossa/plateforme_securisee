const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits = recommandé pour GCM

function getKey() {
  const key = process.env.ENCRYPT_KEY;
  if (!key || key.length !== 64) {
    throw new Error('ENCRYPT_KEY doit faire 64 caractères hex (32 bytes / 256 bits)');
  }
  return Buffer.from(key, 'hex');
}

/**
 * Chiffre un buffer en AES-256-GCM
 * @param {Buffer} buffer - Données à chiffrer
 * @returns {{ encrypted: Buffer, iv: string, authTag: string }}
 */
function encrypt(buffer) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);

  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
  };
}

/**
 * Déchiffre un buffer en AES-256-GCM
 * @param {Buffer} encrypted - Données chiffrées
 * @param {string} ivHex - IV hexadécimal
 * @param {string} authTagHex - Auth tag hexadécimal
 * @returns {Buffer} - Données déchiffrées
 */
function decrypt(encrypted, ivHex, authTagHex) {
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

module.exports = { encrypt, decrypt, ALGORITHM };