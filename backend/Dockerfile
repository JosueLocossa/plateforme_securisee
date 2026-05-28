# ─── Image de base ───────────────────────────────
FROM node:24-alpine

# Répertoire de travail dans le conteneur
WORKDIR /app

# Copier d'abord package.json (cache Docker pour les dépendances)
COPY package*.json ./

# Installer les dépendances de production
RUN npm install --omit=dev

# Copier le reste du code source
COPY . .

# Le port exposé par l'application
EXPOSE 3000

# Commande de démarrage
CMD ["node", "src/server.js"]
