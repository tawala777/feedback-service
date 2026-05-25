require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const dbModule = require('./db');
const { getRoute } = require('./routing');
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

function esc(s) {
  return String(s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function dt(ms) {
  return ms ? new Date(ms).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }) : '—';
}

function ticketBlock(c) {
  if (c.dispatch_status === 'sent') {
    return `Envoyé → <b>${esc(c.ticket_destination)}</b>${c.agent_ticket_status ? ` · statut dev : <b>${esc(c.agent_ticket_status)}</b>` : ''}`;
  }
  if (c.dispatch_status === 'failed') {
    return `Échec dispatch : <code>${esc(c.last_dispatch_error)}</code> (retries: ${c.dispatch_attempts || 0})`;
  }
  return esc(c.dispatch_status || 'draft');
}

function renderDashboard(conversations) {
  const rows = conversations.map((c) => {
    const date = dt(c.started_at);
    const state = dispatchLabel(c);
    const stateColor = { draft: '#9ca3af', 'finalisé': '#6b7280', 'en file': '#f59e0b', 'échec (retry)': '#dc2626', 'envoyé': '#059669' }[state] || '#000';
    const preview = esc((c.first_user_message || '').slice(0, 100));
    const ticketCell = (c.dispatch_status === 'sent' && c.ticket_destination)
      ? `${esc(c.ticket_destination)}${c.agent_ticket_status ? ` <small>(${esc(c.agent_ticket_status)})</small>` : ''}`
      : (c.dispatch_status === 'failed' ? `<small title="${esc(c.last_dispatch_error)}">${esc((c.last_dispatch_error || '').slice(0, 40))}…</small>` : '—');
    return `<tr>
      <td><a href="/admin/feedbacks/${c.id}">${date}</a></td>
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
      a { color: #2563eb; text-decoration: none; }
      a:hover { text-decoration: underline; }
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

function renderDetail(conv, messages, spec) {
  const msgs = messages.map((m) => `
    <div class="msg ${m.role}">
      <div class="meta">${esc(m.role)} · ${dt(m.created_at)}</div>
      <div class="body">${esc(m.content)}</div>
    </div>`).join('');

  const specBlock = spec ? `
    <h2>Spec soumise</h2>
    <table class="kv">
      <tr><th>Titre</th><td>${esc(spec.title)}</td></tr>
      <tr><th>Type</th><td>${esc(spec.type)}</td></tr>
      <tr><th>Priorité</th><td>${esc(spec.priority)}</td></tr>
      <tr><th>Tags</th><td>${esc((spec.tags || []).join(', '))}</td></tr>
      <tr><th>Description</th><td><pre>${esc(spec.description)}</pre></td></tr>
    </table>` : '<p><i>Pas encore de spec soumise (conversation non finalisée).</i></p>';

  return `<!DOCTYPE html><html lang="fr"><head>
    <meta charset="UTF-8"><title>Feedback ${esc(conv.id)}</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 20px; color: #111; max-width: 860px; }
      a { color: #2563eb; text-decoration: none; }
      a:hover { text-decoration: underline; }
      .hdr { background:#f3f4f6; padding:12px 16px; border-radius:8px; margin-bottom:16px; font-size:14px; }
      .hdr b { color:#111; }
      .msg { margin-bottom:12px; padding:8px 12px; border-radius:8px; }
      .msg.user { background:#dbeafe; }
      .msg.assistant { background:#f3f4f6; }
      .msg .meta { font-size:12px; color:#6b7280; margin-bottom:4px; }
      .msg .body { white-space:pre-wrap; }
      table.kv { border-collapse:collapse; width:100%; font-size:14px; }
      table.kv th { text-align:left; vertical-align:top; padding:6px 12px; width:120px; color:#6b7280; }
      table.kv td { padding:6px 12px; }
      pre { white-space:pre-wrap; background:#f9fafb; padding:8px; border-radius:6px; margin:0; }
      code { white-space:pre-wrap; background:#f9fafb; padding:2px 6px; border-radius:6px; }
    </style></head><body>
    <p><a href="/admin/feedbacks">← Retour à la liste</a></p>
    <h1>Conversation ${esc(conv.id)}</h1>
    <div class="hdr">
      <b>Source</b> : ${esc(conv.source)} &nbsp;|&nbsp; <b>User</b> : ${esc(conv.user_id) || '<i>anonyme</i>'}<br>
      <b>Créée</b> : ${dt(conv.started_at)} &nbsp;|&nbsp; <b>Finalisée</b> : ${dt(conv.finalized_at)} &nbsp;|&nbsp; <b>Dispatchée</b> : ${dt(conv.dispatched_at)}<br>
      <b>Ticket</b> : ${ticketBlock(conv)}
    </div>
    <h2>Échange</h2>
    ${msgs || '<p><i>Aucun message.</i></p>'}
    ${specBlock}
  </body></html>`;
}

function renderApps(apps) {
  const rows = apps.map((a) => {
    const badge = a.configured ? '<span style="color:#047857;font-weight:600">configurée</span>' : '<span style="color:#b45309;font-weight:700">⚠ à configurer</span>';
    return `<tr>
      <td><code>${esc(a.slug)}</code></td>
      <td>${esc(a.label)}</td>
      <td>${esc(a.agent) || '—'}</td>
      <td>${esc(a.ticket_url) || '—'}</td>
      <td>${esc(a.mission) || '—'}</td>
      <td>${a.lot ?? '—'}</td>
      <td>${a.wave ?? '—'}</td>
      <td>${a.skip ? 'oui' : 'non'}</td>
      <td>${a.active ? 'oui' : 'non'}</td>
      <td>${badge}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html><html lang="fr"><head>
    <meta charset="UTF-8"><title>Apps — Admin</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 20px; color: #111; }
      h1,h2 { margin-bottom: 10px; }
      table { border-collapse: collapse; width: 100%; font-size: 14px; margin-bottom: 28px; }
      th, td { border-bottom: 1px solid #e5e7eb; padding: 8px 12px; text-align: left; vertical-align: top; }
      th { background: #f3f4f6; }
      tr:hover td { background: #fafafa; }
      code { background: #f3f4f6; padding: 2px 6px; border-radius: 3px; font-size: 12px; }
      label { display:block; font-size:13px; color:#374151; margin-bottom:4px; }
      input { width:100%; padding:10px 12px; border:1px solid #d1d5db; border-radius:6px; }
      .grid { display:grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 14px; max-width: 900px; }
      .checks { display:flex; gap:18px; margin: 8px 0 18px; }
      .checks label { display:flex; align-items:center; gap:8px; margin:0; }
      button { background:#2563eb; color:#fff; border:0; padding:10px 16px; border-radius:6px; cursor:pointer; }
      a { color:#2563eb; text-decoration:none; }
    </style></head><body>
      <p><a href="/admin/feedbacks">← Retour feedbacks</a></p>
      <h1>Apps — Admin</h1>
      <table>
        <thead><tr><th>Slug</th><th>Label</th><th>Agent</th><th>ticket_url</th><th>Mission</th><th>Lot</th><th>Wave</th><th>Skip</th><th>Active</th><th>État</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="10">Aucune app</td></tr>'}</tbody>
      </table>
      <h2>Créer / éditer une app</h2>
      <form method="post" action="/api/admin/apps" onsubmit="event.preventDefault(); submitApp(this);">
        <div class="grid">
          <div><label>slug<input name="slug" required></label></div>
          <div><label>label<input name="label"></label></div>
          <div><label>agent<input name="agent" placeholder="candy ou sandy"></label></div>
          <div><label>ticket_url<input name="ticket_url" placeholder="http://localhost:4000/api/tickets"></label></div>
          <div><label>mission<input name="mission"></label></div>
          <div><label>lot<input name="lot" type="number"></label></div>
          <div><label>wave<input name="wave" type="number"></label></div>
        </div>
        <div class="checks">
          <label><input type="checkbox" name="skip"> skip</label>
          <label><input type="checkbox" name="active" checked> active</label>
        </div>
        <button type="submit">Enregistrer</button>
        <span id="msg" style="margin-left:12px;color:#6b7280"></span>
      </form>
      <script>
        async function submitApp(form) {
          const fd = new FormData(form);
          const body = {
            slug: fd.get('slug'),
            label: fd.get('label'),
            agent: fd.get('agent'),
            ticket_url: fd.get('ticket_url'),
            mission: fd.get('mission'),
            lot: fd.get('lot') === '' ? null : Number(fd.get('lot')),
            wave: fd.get('wave') === '' ? null : Number(fd.get('wave')),
            skip: fd.get('skip') ? 1 : 0,
            active: fd.get('active') ? 1 : 0
          };
          const resp = await fetch('/api/admin/apps', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
          const msg = document.getElementById('msg');
          if (!resp.ok) {
            msg.textContent = 'Erreur de sauvegarde';
            return;
          }
          msg.textContent = 'Enregistré, recharge la page pour voir les valeurs mises à jour.';
        }
      </script>
    </body></html>`;
}

app.get('/api/feedback/health', (req, res) => {
  res.json({ ok: true, port: PORT, ts: new Date().toISOString(), db: dbModule.counts() });
});

app.get('/api/admin/apps', (req, res) => {
  res.json(dbModule.listApps());
});

app.post('/api/admin/apps', (req, res) => {
  const { slug, agent } = req.body;
  if (!slug) return res.status(400).json({ error: 'slug requis' });
  const configured = agent ? 1 : 0;
  dbModule.upsertApp({ ...req.body, configured });
  res.json({ ok: true, app: dbModule.getApp(slug) });
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

async function enrichAgentTicketStatus(conv) {
  if (conv.dispatch_status === 'sent' && conv.ticket_id) {
    const route = getRoute(conv.source);
    if (route && route.url) {
      try {
        const url = route.url.replace(/\/api\/tickets$/, `/api/tickets/${conv.ticket_id}`);
        const resp = await fetch(url);
        if (resp.ok) {
          const t = await resp.json();
          conv.agent_ticket_status = t.status || '?';
        } else {
          conv.agent_ticket_status = `http ${resp.status}`;
        }
      } catch {
        conv.agent_ticket_status = 'unreachable';
      }
    }
  }
}

app.get('/admin/feedbacks', async (req, res) => {
  const conversations = dbModule.db.prepare(`
    SELECT c.*,
           (SELECT content FROM messages WHERE conversation_id = c.id AND role = 'user' ORDER BY id ASC LIMIT 1) AS first_user_message
    FROM conversations c
    ORDER BY c.started_at DESC
    LIMIT 200
  `).all();

  for (const c of conversations) {
    await enrichAgentTicketStatus(c);
  }

  res.send(renderDashboard(conversations));
});

app.get('/admin/feedbacks/:id', async (req, res) => {
  const conv = dbModule.db.prepare('SELECT * FROM conversations WHERE id = ?').get(req.params.id);
  if (!conv) return res.status(404).send('<!DOCTYPE html><meta charset="UTF-8"><p>Conversation introuvable.</p>');

  const messages = dbModule.db.prepare(
    'SELECT role, content, created_at FROM messages WHERE conversation_id = ? ORDER BY id ASC'
  ).all(conv.id);

  let spec = null;
  if (conv.submit_spec) {
    try { spec = JSON.parse(conv.submit_spec); } catch {}
  }

  await enrichAgentTicketStatus(conv);
  res.send(renderDetail(conv, messages, spec));
});

app.get('/admin/apps', (req, res) => {
  res.send(renderApps(dbModule.listApps()));
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
