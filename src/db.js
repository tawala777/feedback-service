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
  return db.prepare('SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY id ASC')
    .all(conversationId);
}

function finalizeConversation({ conversationId, ticketId, ticketDestination }) {
  db.prepare('UPDATE conversations SET finalized_at = ?, ticket_id = ?, ticket_destination = ? WHERE id = ?')
    .run(Date.now(), ticketId, ticketDestination, conversationId);
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

function counts() {
  const conversations = db.prepare('SELECT COUNT(1) as n FROM conversations').get().n;
  const messages = db.prepare('SELECT COUNT(1) as n FROM messages').get().n;
  return { conversations, messages };
}

migrate();

module.exports = { db, createConversation, addMessage, getMessages, finalizeConversation, markReadyForDispatch, getPendingDispatch, markDispatched, markDispatchFailed, counts };
