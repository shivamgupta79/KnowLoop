const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(process.env.DB_FILE || path.join(__dirname, '..', 'knowloop.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, pass_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('student','professional')),
  org TEXT DEFAULT '', headline TEXT DEFAULT '', bio TEXT DEFAULT '', linkedin TEXT DEFAULT '',
  teach TEXT DEFAULT '[]', learn TEXT DEFAULT '[]',
  verified INTEGER DEFAULT 0, xp INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS slots(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_ts TEXT NOT NULL, duration INTEGER NOT NULL DEFAULT 30, booked INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS bookings(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slot_id INTEGER NOT NULL REFERENCES slots(id),
  mentor_id INTEGER NOT NULL REFERENCES users(id),
  learner_id INTEGER NOT NULL REFERENCES users(id),
  topic TEXT NOT NULL, message TEXT DEFAULT '',
  mode TEXT DEFAULT 'learn' CHECK(mode IN ('learn','swap')), swap_skill TEXT DEFAULT '',
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined','cancelled','completed')),
  notes TEXT DEFAULT '', room TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS messages(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  sender_id INTEGER NOT NULL REFERENCES users(id), body TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS reviews(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  reviewer_id INTEGER NOT NULL REFERENCES users(id),
  reviewee_id INTEGER NOT NULL REFERENCES users(id),
  rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5), comment TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(booking_id, reviewer_id)
);
CREATE TABLE IF NOT EXISTS requests(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill TEXT NOT NULL, details TEXT DEFAULT '', status TEXT DEFAULT 'open',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS offers(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id), message TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(request_id, user_id)
);
CREATE TABLE IF NOT EXISTS reports(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id INTEGER NOT NULL, target_id INTEGER NOT NULL, reason TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_slots_user ON slots(user_id, start_ts);
CREATE INDEX IF NOT EXISTS idx_book_users ON bookings(mentor_id, learner_id);
`);
module.exports = db;
