const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DB_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const dbPath = path.join(DB_DIR, 'conversations.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

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

function counts() {
  const conversations = db.prepare('SELECT COUNT(1) as n FROM conversations').get().n;
  const messages = db.prepare('SELECT COUNT(1) as n FROM messages').get().n;
  return { conversations, messages };
}

migrate();

module.exports = { db, createConversation, addMessage, getMessages, finalizeConversation, counts };
