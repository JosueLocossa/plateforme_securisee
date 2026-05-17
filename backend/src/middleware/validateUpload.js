const FileType = require('file-type');

// Whitelist des types autorisés (extensible selon besoins métier)
const MIME_AUTORISES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/msword', // .doc
  'text/plain',
];

const TAILLE_MAX = 50 * 1024 * 1024; // 50 MB

async function validateUpload(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier envoyé' });
    }

    // 1. Vérification taille
    if (req.file.size > TAILLE_MAX) {
      return res.status(413).json({
        error: `Fichier trop volumineux (max ${TAILLE_MAX / 1024 / 1024} MB)`,
      });
    }

    if (req.file.size === 0) {
      return res.status(400).json({ error: 'Fichier vide' });
    }

    // 2. Vérification MIME déclaré
    if (!MIME_AUTORISES.includes(req.file.mimetype)) {
      return res.status(415).json({
        error: `Type non autorisé : ${req.file.mimetype}`,
        autorises: MIME_AUTORISES,
      });
    }

    // 3. Vérification magic bytes (le vrai type, pas seulement déclaré)
    // Note : file-type ne détecte pas les fichiers texte purs (txt, csv)
    if (req.file.mimetype !== 'text/plain') {
      const detected = await FileType.fromBuffer(req.file.buffer);

      if (!detected) {
        return res.status(415).json({
          error: 'Type de fichier non reconnu (magic bytes manquants)',
        });
      }

      if (!MIME_AUTORISES.includes(detected.mime)) {
        return res.status(415).json({
          error: `Type réel non autorisé : ${detected.mime} (déclaré : ${req.file.mimetype})`,
        });
      }

      // 4. Cohérence MIME déclaré vs détecté (anti-spoofing)
      if (detected.mime !== req.file.mimetype) {
        return res.status(400).json({
          error: `Incohérence MIME : déclaré ${req.file.mimetype}, détecté ${detected.mime}`,
        });
      }
    }

    next();
  } catch (err) {
    console.error('Erreur validateUpload:', err);
    res.status(500).json({ error: 'Erreur de validation du fichier' });
  }
}

module.exports = { validateUpload, MIME_AUTORISES, TAILLE_MAX };