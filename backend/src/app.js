require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const app     = express();

// CORS pour autoriser le frontend en dev local
app.use(cors());

// Parser JSON
app.use(express.json());

// Servir le frontend statique
app.use(express.static(path.join(__dirname, '../../frontend')));

// Routes API
app.use('/api/auth',      require('./api/auth'));
app.use('/api/documents', require('./api/documents'));
app.use('/api/audit',     require('./api/audit'));

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

module.exports = app;