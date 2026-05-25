require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const dbModule = require('./db');

const app = express();
const PORT = process.env.PORT || 4400;
const ORIGINS = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(express.json({ limit: '1mb' }));
app.use(cors({ origin: ORIGINS }));

app.get('/api/feedback/health', (req, res) => {
  res.json({ ok: true, port: PORT, ts: new Date().toISOString(), db: dbModule.counts() });
});

app.use('/widget', express.static(path.join(__dirname, '..', 'public'), {
  maxAge: '5m',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    }
  }
}));

app.listen(PORT, '127.0.0.1', () => {
  console.log(`feedback-service listening on 127.0.0.1:${PORT}`);
});
