const fs   = require('fs');
const path = require('path');
const { encrypt, decrypt } = require('../utils/encrypt');
require('dotenv').config();

// Dossier local qui simule le NAS
const NAS_PATH = path.resolve(process.env.NAS_PATH || './storage');

if (!fs.existsSync(NAS_PATH)) {
  fs.mkdirSync(NAS_PATH, { recursive: true });
  console.log(`📁 Dossier NAS simulé créé : ${NAS_PATH}`);
}

/**
 * Sauvegarde un fichier sur le NAS (chiffré AES-256)
 * @param {Buffer} fileBuffer  - contenu brut du fichier
 * @param {string} fileName    - nom original du fichier
 * @returns {string}           - nom unique du fichier sur le NAS
 */
const saveFile = (fileBuffer, fileName) => {
  const key = process.env.ENCRYPT_KEY;
  if (!key || key.length !== 64) {
    throw new Error('ENCRYPT_KEY invalide dans .env (64 caractères hex requis)');
  }

  const encrypted  = encrypt(fileBuffer, key);
  const uniqueName = `${Date.now()}_${fileName}.enc`;
  const filePath   = path.join(NAS_PATH, uniqueName);

  fs.writeFileSync(filePath, JSON.stringify(encrypted));
  console.log(`💾 Fichier sauvegardé chiffré : ${uniqueName}`);
  return uniqueName;
};

/**
 * Lire et déchiffrer un fichier depuis le NAS
 * @param {string} cheminNas  - nom du fichier sur le NAS
 * @returns {Buffer}           - contenu déchiffré
 */
const readFile = (cheminNas) => {
  const key      = process.env.ENCRYPT_KEY;
  const filePath = path.join(NAS_PATH, cheminNas);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Fichier introuvable sur le NAS : ${cheminNas}`);
  }

  const encryptedData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return decrypt(encryptedData, key);
};

/**
 * Supprimer un fichier du NAS (workflow de purge)
 * @param {string} cheminNas
 */
const deleteFile = (cheminNas) => {
  const filePath = path.join(NAS_PATH, cheminNas);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    console.log(`🗑️  Fichier supprimé du NAS : ${cheminNas}`);
  }
};

module.exports = { saveFile, readFile, deleteFile };
