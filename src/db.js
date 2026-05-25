require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DB_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const dbPath = path.join(DB_DIR, 'conversations.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

function columnExists(table, col) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col);
}

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      user_id TEXT,
      started_at INTEGER NOT NULL,
      finalized_at INTEGER,
      ticket_id TEXT,
      ticket_destination TEXT
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id)
    );
    CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, id);
  `);

  const addCol = (table, col, def) => {
    if (!columnExists(table, col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
  };
  addCol('conversations', 'submit_spec', 'TEXT');
  addCol('conversations', 'dispatch_status', 'TEXT');
  addCol('conversations', 'dispatch_attempts', 'INTEGER DEFAULT 0');
  addCol('conversations', 'last_dispatch_error', 'TEXT');
  addCol('conversations', 'dispatched_at', 'INTEGER');

  db.exec(`
    CREATE TABLE IF NOT EXISTS apps (
      slug TEXT PRIMARY KEY,
      label TEXT,
      agent TEXT,
      ticket_url TEXT,
      mission TEXT,
      lot INTEGER,
      wave INTEGER,
      skip INTEGER NOT NULL DEFAULT 0,
      configured INTEGER NOT NULL DEFAULT 1,
      active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  const n = db.prepare('SELECT COUNT(1) AS n FROM apps').get().n;
  if (n === 0) {
    const now = Date.now();
    const ins = db.prepare(`INSERT INTO apps (slug,label,agent,ticket_url,mission,lot,wave,skip,configured,active,created_at,updated_at)
                            VALUES (@slug,@label,@agent,@ticket_url,@mission,@lot,@wave,@skip,1,1,${now},${now})`);
    const seed = [
      { slug: 'bookingsExtApi', label: 'bookingsExtApi', agent: 'candy', ticket_url: 'http://localhost:4000/api/tickets', mission: null, lot: null, wave: null, skip: 0 },
      { slug: 'team-tracker', label: 'team-tracker', agent: 'candy', ticket_url: 'http://localhost:4000/api/tickets', mission: null, lot: null, wave: null, skip: 0 },
      { slug: 'aam-website', label: 'aam-website', agent: 'candy', ticket_url: 'http://localhost:4000/api/tickets', mission: null, lot: null, wave: null, skip: 0 },
      { slug: 'stats-v1', label: 'stats-v1', agent: 'sandy', ticket_url: process.env.SANDY_TICKETS_URL || null, mission: 'user-feedback', lot: 0, wave: 4, skip: 0 },
      { slug: 'hotel-aggregator', label: 'hotel-aggregator', agent: 'sandy', ticket_url: process.env.SANDY_TICKETS_URL || null, mission: 'user-feedback', lot: 0, wave: 4, skip: 0 }
    ];
    db.transaction((rows) => rows.forEach((r) => ins.run(r)))(seed);
  }

  upsertApp({ slug: 'demo', label: 'Démo (page de test)', agent: null, ticket_url: null, skip: 1, configured: 1, active: 1 });
}

function createConversation({ source, userId }) {
  const id = crypto.randomUUID();
  const now = Date.now();
  db.prepare('INSERT INTO conversations (id, source, user_id, started_at) VALUES (?, ?, ?, ?)')
    .run(id, source, userId || null, now);
  return id;
}

function addMessage({ conversationId, role, content }) {
  db.prepare('INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?, ?, ?, ?)')
    .run(conversationId, role, content, Date.now());
}

function getMessages(conversationId) {
  return db.prepare('SELECT role, content, created_at FROM messages WHERE conversation_id = ? ORDER BY id ASC')
    .all(conversationId);
}

function finalizeConversation({ conversationId, ticketId, ticketDestination }) {
  db.prepare('UPDATE conversations SET finalized_at = ?, ticket_id = ?, ticket_destination = ? WHERE id = ?')
    .run(Date.now(), ticketId, ticketDestination, conversationId);
}

function setConversationUser(conversationId, userId) {
  db.prepare('UPDATE conversations SET user_id = ? WHERE id = ?').run(userId, conversationId);
}

function markReadyForDispatch({ conversationId, submitSpec }) {
  db.prepare(
    `UPDATE conversations SET finalized_at = ?, submit_spec = ?, dispatch_status = 'pending' WHERE id = ?`
  ).run(Date.now(), JSON.stringify(submitSpec), conversationId);
}

function getPendingDispatch(maxAttempts) {
  return db.prepare(
    `SELECT * FROM conversations
     WHERE dispatch_status IN ('pending','failed') AND COALESCE(dispatch_attempts,0) < ?
     ORDER BY finalized_at ASC`
  ).all(maxAttempts);
}

function markDispatched({ conversationId, ticketId, destination }) {
  db.prepare(
    `UPDATE conversations SET dispatch_status='sent', ticket_id=?, ticket_destination=?, dispatched_at=? WHERE id=?`
  ).run(ticketId, destination, Date.now(), conversationId);
}

function markDispatchFailed({ conversationId, error }) {
  db.prepare(
    `UPDATE conversations SET dispatch_status='failed', last_dispatch_error=?, dispatch_attempts=COALESCE(dispatch_attempts,0)+1 WHERE id=?`
  ).run(String(error).slice(0, 500), conversationId);
}

function markDispatchSkipped({ conversationId }) {
  db.prepare(`UPDATE conversations SET dispatch_status='skipped', dispatched_at=? WHERE id=?`)
    .run(Date.now(), conversationId);
}

function requeueDispatch(conversationId) {
  db.prepare(`UPDATE conversations
              SET dispatch_status='pending', dispatch_attempts=0, last_dispatch_error=NULL
              WHERE id=?`).run(conversationId);
}

function listApps() {
  return db.prepare('SELECT * FROM apps ORDER BY configured ASC, slug ASC').all();
}

function getApp(slug) {
  return db.prepare('SELECT * FROM apps WHERE slug = ?').get(slug);
}

function discoverApp(slug) {
  if (getApp(slug)) return getApp(slug);
  const now = Date.now();
  db.prepare(`INSERT INTO apps (slug,label,agent,ticket_url,mission,lot,wave,skip,configured,active,created_at,updated_at)
              VALUES (?,?,NULL,NULL,NULL,NULL,NULL,0,0,1,${now},${now})`).run(slug, slug);
  return getApp(slug);
}

function upsertApp(a) {
  const now = Date.now();
  db.prepare(`INSERT INTO apps (slug,label,agent,ticket_url,mission,lot,wave,skip,configured,active,created_at,updated_at)
    VALUES (@slug,@label,@agent,@ticket_url,@mission,@lot,@wave,@skip,@configured,@active,${now},${now})
    ON CONFLICT(slug) DO UPDATE SET label=@label, agent=@agent, ticket_url=@ticket_url,
      mission=@mission, lot=@lot, wave=@wave, skip=@skip, configured=@configured, active=@active, updated_at=${now}`)
    .run({
      slug: a.slug,
      label: a.label || a.slug,
      agent: a.agent || null,
      ticket_url: a.ticket_url || null,
      mission: a.mission || null,
      lot: (a.lot ?? null),
      wave: (a.wave ?? null),
      skip: a.skip ? 1 : 0,
      configured: a.configured ? 1 : 0,
      active: a.active === 0 ? 0 : 1
    });
}

function counts() {
  const conversations = db.prepare('SELECT COUNT(1) as n FROM conversations').get().n;
  const messages = db.prepare('SELECT COUNT(1) as n FROM messages').get().n;
  return { conversations, messages };
}

migrate();

module.exports = {
  db,
  createConversation,
  addMessage,
  getMessages,
  finalizeConversation,
  setConversationUser,
  markReadyForDispatch,
  getPendingDispatch,
  markDispatched,
  markDispatchFailed,
  markDispatchSkipped,
  requeueDispatch,
  listApps,
  getApp,
  discoverApp,
  upsertApp,
  counts
};
