CREATE TABLE IF NOT EXISTS message_replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT '内部记录',
  operator TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_message_replies_message_created
  ON message_replies(message_id, created_at DESC);
