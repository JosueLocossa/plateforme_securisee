// Ce fichier est exécuté AVANT que les modules de l'app soient chargés
// pour que les bonnes variables d'env soient en place
require('dotenv').config({ path: __dirname + '/../.env.test' });
