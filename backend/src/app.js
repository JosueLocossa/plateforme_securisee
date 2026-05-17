require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const helmet   = require('helmet');
const rateLimit = require('express-rate-limit');
const path     = require('path');
const app      = express();

// ─────────────────────────────────────────────
// Sécurité — Headers HTTP (Helmet)
// ─────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:    ["'self'"],
      scriptSrc:     ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc:      ["'self'", "'unsafe-inline'"],
      imgSrc:        ["'self'", 'data:', 'blob:'],
      connectSrc:    ["'self'"],
    },
  },
}));

// ─────────────────────────────────────────────
// CORS (dev local — à restreindre en prod)
// ─────────────────────────────────────────────
app.use(cors());

// ─────────────────────────────────────────────
// Rate limiting global
// ─────────────────────────────────────────────
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,            // 1 minute
  max: 100,                       // 100 req/min/IP
  message: { error: 'Trop de requêtes — réessayez dans 1 minute' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting strict sur l'authentification (anti brute-force)
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,                         // 5 req/min/IP sur /auth
  message: { error: 'Trop de tentatives — réessayez dans 1 minute' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(generalLimiter);

// Parser JSON
app.use(express.json({ limit: '1mb' }));

// Servir le frontend statique
app.use(express.static(path.join(__dirname, '../../frontend')));

// ─────────────────────────────────────────────
// Routes API
// ─────────────────────────────────────────────
app.use('/api/auth',      authLimiter, require('./api/auth'));
app.use('/api/documents', require('./api/documents'));
app.use('/api/audit',     require('./api/audit'));

// Health check (public)
app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

module.exports = app;