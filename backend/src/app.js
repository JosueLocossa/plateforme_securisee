require('dotenv').config();
const express = require('express');
const app     = express();

app.use(express.json());

app.use('/api/auth',      require('./api/auth'));
app.use('/api/documents', require('./api/documents'));

app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

module.exports = app;
