require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const dbModule = require('./db');
const { chat, extractSubmitJson } = require('./llm');

const app = express();
const PORT = process.env.PORT || 4400;
const ORIGINS = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(express.json({ limit: '1mb' }));
app.use(cors({ origin: ORIGINS }));

const LLM_DOWN_MESSAGE = 'Le service de cadrage est momentanément indisponible. Réessaie dans un instant.';

app.get('/api/feedback/health', (req, res) => {
  res.json({ ok: true, port: PORT, ts: new Date().toISOString(), db: dbModule.counts() });
});

app.post('/api/feedback/chat', async (req, res) => {
  try {
    const { conversationId, source, message, userId } = req.body;
    if (!source) return res.status(400).json({ error: 'source required' });
    if (!message || typeof message !== 'string') return res.status(400).json({ error: 'message required' });

    let convId = conversationId;
    if (!convId) convId = dbModule.createConversation({ source, userId });

    dbModule.addMessage({ conversationId: convId, role: 'user', content: message });
    const history = dbModule.getMessages(convId);

    const result = await chat({ source, messages: history });

    if (!result.ok) {
      return res.json({
        conversationId: convId,
        message: LLM_DOWN_MESSAGE,
        readyForSubmit: false,
        error: result.error
      });
    }

    dbModule.addMessage({ conversationId: convId, role: 'assistant', content: result.text });
    const submitSpec = extractSubmitJson(result.text);

    return res.json({
      conversationId: convId,
      message: result.text,
      readyForSubmit: !!submitSpec,
      submitSpec: submitSpec || null
    });
  } catch (err) {
    console.error('chat error', err);
    return res.status(500).json({ error: 'internal error', detail: err.message });
  }
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
