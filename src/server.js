require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const dbModule = require('./db');
const ROUTING = require('./routing');
const { chat, extractSubmitJson } = require('./llm');
const { runDispatch } = require('./dispatcher');

const app = express();
const PORT = process.env.PORT || 4400;
const ORIGINS = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(express.json({ limit: '1mb' }));
app.use(cors({ origin: ORIGINS }));

const LLM_DOWN_MESSAGE = 'Le service de cadrage est momentanément indisponible. Réessaie dans un instant.';

function dispatchLabel(c) {
  if (!c.dispatch_status) return c.finalized_at ? 'finalisé' : 'draft';
  return { pending: 'en file', failed: 'échec (retry)', sent: 'envoyé' }[c.dispatch_status] || c.dispatch_status;
}

function renderDashboard(conversations) {
  const esc = (s) => String(s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const rows = conversations.map((c) => {
    const date = new Date(c.started_at).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
    const state = dispatchLabel(c);
    const stateColor = { draft: '#9ca3af', 'finalisé': '#6b7280', 'en file': '#f59e0b', 'échec (retry)': '#dc2626', 'envoyé': '#059669' }[state] || '#000';
    const preview = esc((c.first_user_message || '').slice(0, 100));
    const ticketCell = (c.dispatch_status === 'sent' && c.ticket_destination)
      ? `${esc(c.ticket_destination)}${c.agent_ticket_status ? ` <small>(${esc(c.agent_ticket_status)})</small>` : ''}`
      : (c.dispatch_status === 'failed' ? `<small title="${esc(c.last_dispatch_error)}">${esc((c.last_dispatch_error || '').slice(0, 40))}…</small>` : '—');
    return `<tr>
      <td>${date}</td>
      <td><code>${esc(c.source)}</code></td>
      <td>${esc(c.user_id) || '<i>anonyme</i>'}</td>
      <td>${preview}</td>
      <td style="color:${stateColor}"><b>${state}</b></td>
      <td>${ticketCell}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html><html lang="fr"><head>
    <meta charset="UTF-8"><title>Feedbacks — Admin</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 20px; color: #111; }
      h1 { font-size: 20px; }
      table { border-collapse: collapse; width: 100%; font-size: 14px; }
      th, td { border-bottom: 1px solid #e5e7eb; padding: 8px 12px; text-align: left; vertical-align: top; }
      th { background: #f3f4f6; }
      tr:hover td { background: #fafafa; }
      code { background: #f3f4f6; padding: 2px 6px; border-radius: 3px; font-size: 12px; }
      .count { color: #6b7280; margin-bottom: 16px; }
    </style></head><body>
    <h1>Feedbacks — Admin</h1>
    <p class="count">${conversations.length} conversation(s)</p>
    <table>
      <thead><tr>
        <th>Date (Paris)</th><th>Source</th><th>User</th><th>Demande (extrait)</th><th>État</th><th>Ticket</th>
      </tr></thead>
      <tbody>${rows || '<tr><td colspan="6" style="text-align:center;color:#999">Aucune conversation</td></tr>'}</tbody>
    </table>
    <p style="margin-top:24px;color:#6b7280;font-size:12px">Rafraîchir la page pour mettre à jour les statuts.</p>
  </body></html>`;
}

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

app.post('/api/feedback/submit', (req, res) => {
  try {
    const { conversationId } = req.body;
    if (!conversationId) return res.status(400).json({ error: 'conversationId required' });

    const messages = dbModule.getMessages(conversationId);
    if (!messages.length) return res.status(404).json({ error: 'conversation not found' });

    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
    if (!lastAssistant) return res.status(400).json({ error: 'no assistant message' });

    const spec = extractSubmitJson(lastAssistant.content);
    if (!spec) return res.status(400).json({ error: 'spec not finalized (no [READY_FOR_SUBMIT] marker)' });

    dbModule.markReadyForDispatch({ conversationId, submitSpec: spec });
    return res.json({ conversationId, status: 'queued' });
  } catch (err) {
    console.error('submit error', err);
    return res.status(500).json({ error: 'internal error', detail: err.message });
  }
});

app.get('/admin/feedbacks', async (req, res) => {
  const conversations = dbModule.db.prepare(`
    SELECT c.*,
           (SELECT content FROM messages WHERE conversation_id = c.id AND role = 'user' ORDER BY id ASC LIMIT 1) AS first_user_message
    FROM conversations c
    ORDER BY c.started_at DESC
    LIMIT 200
  `).all();

  for (const c of conversations) {
    if (c.dispatch_status === 'sent' && c.ticket_id) {
      const route = ROUTING[c.source];
      if (route && route.url) {
        try {
          const url = route.url.replace(/\/api\/tickets$/, `/api/tickets/${c.ticket_id}`);
          const resp = await fetch(url);
          if (resp.ok) {
            const t = await resp.json();
            c.agent_ticket_status = t.status || '?';
          } else {
            c.agent_ticket_status = `http ${resp.status}`;
          }
        } catch {
          c.agent_ticket_status = 'unreachable';
        }
      }
    }
  }

  res.send(renderDashboard(conversations));
});

app.use('/widget', express.static(path.join(__dirname, '..', 'public'), {
  maxAge: '5m',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    }
  }
}));

setInterval(() => runDispatch().catch((e) => console.error('[dispatcher] run error', e)), 2 * 60 * 1000);
runDispatch().catch((e) => console.error('[dispatcher] startup run error', e));

app.listen(PORT, '127.0.0.1', () => {
  console.log(`feedback-service listening on 127.0.0.1:${PORT}`);
});
