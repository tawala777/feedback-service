const { getRoute } = require('./routing');
const db = require('./db');

const MAX_ATTEMPTS = 5;
const SERVICE_URL = process.env.FEEDBACK_SERVICE_URL || process.env.SERVICE_URL || `http://localhost:${process.env.PORT || 4400}`;

function formatConversationLink(conversationId) {
  return `${SERVICE_URL.replace(/\/$/, '')}/admin/feedbacks/${conversationId}`;
}

function formatTranscript(messages) {
  if (!messages.length) return '- (aucun message)';

  return messages.map((message) => {
    const ts = message.created_at ? new Date(message.created_at).toISOString() : 'unknown-date';
    const body = String(message.content || '')
      .split('\n')
      .map((line) => `  ${line}`)
      .join('\n');
    return `- [${ts}] ${message.role}:\n${body}`;
  }).join('\n\n');
}

function buildPayload(route, source, spec, conversation) {
  const detailUrl = formatConversationLink(conversation.id);
  const transcript = formatTranscript(conversation.messages || []);

  return {
    title: `[${source}] ${spec.title}`,
    description: `${spec.description}\n\nConversation + detail : ${detailUrl}\n\n## Conversation complete\n${transcript}\n\n---\n*Soumis via feedback-service depuis ${source}*`,
    priority: spec.priority || 'medium',
    mission: route.mission,
    lot: route.lot,
    wave: route.wave,
    createdBy: 'feedback-service'
  };
}

async function dispatchOne(conv) {
  const route = getRoute(conv.source);
  if (!route) {
    db.discoverApp(conv.source);
    console.log(`[dispatcher] source inconnue "${conv.source}" → app créée (à configurer), feedback en file`);
    return;
  }
  if (route.skip) {
    db.markDispatchSkipped({ conversationId: conv.id });
    return;
  }
  if (!route.url) return;

  let spec;
  try {
    spec = JSON.parse(conv.submit_spec);
  } catch {
    db.markDispatchFailed({ conversationId: conv.id, error: 'invalid submit_spec JSON' });
    return;
  }

  const messages = db.getMessages(conv.id);

  try {
    const resp = await fetch(route.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPayload(route, conv.source, spec, { id: conv.id, messages }))
    });
    if (!resp.ok) {
      throw new Error(`upstream ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
    }
    const ticket = await resp.json();
    const ticketId = ticket.id || ticket.ticketId || null;
    db.markDispatched({ conversationId: conv.id, ticketId: String(ticketId), destination: `${route.agent}:${ticketId}` });
    console.log(`[dispatcher] conv ${conv.id} → ${route.agent}:${ticketId}`);
  } catch (err) {
    db.markDispatchFailed({ conversationId: conv.id, error: err.message });
    console.warn(`[dispatcher] conv ${conv.id} échec (tentative): ${err.message}`);
  }
}

async function runDispatch() {
  const pending = db.getPendingDispatch(MAX_ATTEMPTS);
  for (const conv of pending) {
    await dispatchOne(conv);
  }
}

module.exports = { runDispatch, buildPayload };
