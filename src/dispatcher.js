const ROUTING = require('./routing');
const db = require('./db');

const MAX_ATTEMPTS = 5;

function buildPayload(route, source, spec) {
  if (route.agent === 'sandy') {
    return {
      title: spec.title,
      description: `${spec.description}\n\n---\n*Soumis via feedback-service depuis ${source}*`,
      priority: spec.priority || 'medium',
      mission: route.mission,
      lot: route.lot,
      wave: route.wave,
      createdBy: 'feedback-service'
    };
  }

  return {
    title: `[${source}] ${spec.title}`,
    description: `${spec.description}\n\n---\n*Soumis via feedback-service*`,
    priority: spec.priority || 'medium'
  };
}

async function dispatchOne(conv) {
  const route = ROUTING[conv.source];
  if (!route) {
    db.markDispatchFailed({ conversationId: conv.id, error: `unknown source: ${conv.source}` });
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

  try {
    const resp = await fetch(route.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPayload(route, conv.source, spec))
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
