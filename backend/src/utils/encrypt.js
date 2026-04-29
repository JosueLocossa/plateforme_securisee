const crypto    = require('crypto');
const ALGORITHM = 'aes-256-cbc';

const encrypt = (buffer, key) => {
  const iv        = crypto.randomBytes(16);
  const cipher    = crypto.createCipheriv(ALGORITHM, Buffer.from(key, 'hex'), iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  return { iv: iv.toString('hex'), data: encrypted.toString('hex') };
};

const decrypt = (encryptedData, key) => {
  const iv       = Buffer.from(encryptedData.iv, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(key, 'hex'), iv);
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedData.data, 'hex')),
    decipher.final()
  ]);
};

module.exports = { encrypt, decrypt };
