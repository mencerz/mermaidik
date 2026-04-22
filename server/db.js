const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'diagrams.db'));

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS diagrams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    code TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    diagram_id INTEGER NOT NULL,
    code TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (diagram_id) REFERENCES diagrams(id) ON DELETE CASCADE
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS ai_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    diagram_id INTEGER NOT NULL,
    prompt TEXT NOT NULL,
    response TEXT,
    model TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (diagram_id) REFERENCES diagrams(id) ON DELETE CASCADE
  )
`);

// Add ai_log_id to versions if not exists
try {
  db.exec(`ALTER TABLE versions ADD COLUMN ai_log_id INTEGER REFERENCES ai_logs(id)`);
} catch {
  // Column already exists
}

module.exports = db;
