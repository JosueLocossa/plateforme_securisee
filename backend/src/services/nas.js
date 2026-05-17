const fs   = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { encrypt, decrypt } = require('../utils/encrypt');

const NAS_PATH = process.env.NAS_PATH || './storage';

/**
 * Sauvegarde un fichier chiffré sur le NAS
 * @param {Buffer} buffer - Contenu du fichier en clair
 * @returns {{ cheminNas: string, uuid: string, iv: string, authTag: string }}
 */
function saveFile(buffer) {
  // Génère un UUID unique pour le nom de fichier (anonymise)
  const uuid = uuidv4();

  // Organise par année/mois (facilite la purge)
  const now = new Date();
  const annee = now.getFullYear();
  const mois  = String(now.getMonth() + 1).padStart(2, '0');

  const dossier = path.join(NAS_PATH, String(annee), mois);
  fs.mkdirSync(dossier, { recursive: true });

  const cheminNas = path.join(dossier, `${uuid}.enc`);

  // Chiffrement AES-256-GCM
  const { encrypted, iv, authTag } = encrypt(buffer);

  // Écriture sur disque
  fs.writeFileSync(cheminNas, encrypted);

  return { cheminNas, uuid, iv, authTag };
}

/**
 * Lit et déchiffre un fichier depuis le NAS
 * @param {string} cheminNas - Chemin du fichier chiffré
 * @param {string} ivHex - IV stocké en BDD
 * @param {string} authTagHex - Auth tag stocké en BDD
 * @returns {Buffer} - Contenu en clair
 */
function readFile(cheminNas, ivHex, authTagHex) {
  if (!fs.existsSync(cheminNas)) {
    throw new Error(`Fichier introuvable : ${cheminNas}`);
  }
  const encrypted = fs.readFileSync(cheminNas);
  return decrypt(encrypted, ivHex, authTagHex);
}

/**
 * Supprime définitivement un fichier du NAS (purge RGPD)
 * @param {string} cheminNas - Chemin du fichier
 */
function deleteFile(cheminNas) {
  if (fs.existsSync(cheminNas)) {
    fs.unlinkSync(cheminNas);
  }
}

module.exports = { saveFile, readFile, deleteFile };