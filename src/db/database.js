const Database = require('better-sqlite3');
const path = require('path');

// On Render with a persistent disk mounted at /opt/render/project/src/data,
// DB_PATH resolves correctly to that mount point via the ../../ traversal.
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/leads.db');

// Ensure data directory exists
const fs = require('fs');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Schema ────────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS prospects (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    organization  TEXT NOT NULL,
    type          TEXT NOT NULL CHECK(type IN ('agency','school')),
    email         TEXT UNIQUE NOT NULL,
    contact_name  TEXT,
    contact_title TEXT,
    status        TEXT NOT NULL DEFAULT 'new'
                    CHECK(status IN ('new','contacted','engaged','replied','booked','unsubscribed','bounced')),
    sequence_step INTEGER NOT NULL DEFAULT 0,
    paused        INTEGER NOT NULL DEFAULT 0,
    last_contacted TEXT,
    next_send_date TEXT,
    notes         TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sent_emails (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    prospect_id INTEGER NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
    step        INTEGER NOT NULL,
    subject     TEXT NOT NULL,
    body        TEXT NOT NULL,
    sent_at     TEXT NOT NULL DEFAULT (datetime('now')),
    message_id  TEXT
  );

  CREATE TABLE IF NOT EXISTS replies (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    prospect_id        INTEGER NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
    reply_text         TEXT,
    received_at        TEXT NOT NULL DEFAULT (datetime('now')),
    action_taken       TEXT,
    suggested_response TEXT,
    graph_message_id   TEXT UNIQUE
  );

  CREATE TABLE IF NOT EXISTS linkedin_posts (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    post_type  TEXT NOT NULL CHECK(post_type IN ('hook','education','community','proof')),
    content    TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','archived')),
    week_of    TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS activity_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    action     TEXT NOT NULL,
    details    TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS system_config (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// ── Default config values ─────────────────────────────────────────────────────

const defaultConfig = {
  daily_send_limit:  '50',
  schedule_time:     '08:00',
  last_run:          '',
  emails_sent_today: '0',
  last_run_date:     '',
};

const insertConfig = db.prepare(
  'INSERT OR IGNORE INTO system_config (key, value) VALUES (?, ?)'
);
for (const [key, value] of Object.entries(defaultConfig)) {
  insertConfig.run(key, value);
}

// ── Seed prospects (only if table is empty) ───────────────────────────────────

const count = db.prepare('SELECT COUNT(*) as n FROM prospects').get();
if (count.n === 0) {
  const insert = db.prepare(`
    INSERT INTO prospects (name, organization, type, email, contact_name, contact_title, status, next_send_date)
    VALUES (@name, @organization, @type, @email, @contact_name, @contact_title, @status, @next_send_date)
  `);

  const today = new Date().toISOString().split('T')[0];

  const seeds = [
    {
      name:          'FDNY Bureau of EMS',
      organization:  'FDNY Bureau of EMS',
      type:          'agency',
      email:         'ems.operations@fdny.nyc.gov',
      contact_name:  'Paul Miano',
      contact_title: 'Chief of EMS Operations',
      status:        'new',
      next_send_date: today,
    },
    {
      name:          'UCLA Center for Prehospital Care',
      organization:  'UCLA Center for Prehospital Care',
      type:          'school',
      email:         'prehospital@mednet.ucla.edu',
      contact_name:  'Program Director',
      contact_title: 'EMS Program Director',
      status:        'new',
      next_send_date: today,
    },
    {
      name:          'TEEX EMS Program',
      organization:  'Texas A&M Engineering Extension Service',
      type:          'school',
      email:         'ems@teex.tamu.edu',
      contact_name:  'EMS Program Manager',
      contact_title: 'EMS Program Manager',
      status:        'new',
      next_send_date: today,
    },
    {
      name:          'Wake County EMS',
      organization:  'Wake County EMS',
      type:          'agency',
      email:         'ems.director@wakegov.com',
      contact_name:  'EMS Director',
      contact_title: 'EMS Director',
      status:        'new',
      next_send_date: today,
    },
    {
      name:          'Dallas College EMS Program',
      organization:  'Dallas College',
      type:          'school',
      email:         'ems.program@dallascollege.edu',
      contact_name:  'Program Director',
      contact_title: 'EMS Program Director',
      status:        'new',
      next_send_date: today,
    },
  ];

  for (const s of seeds) insert.run(s);
  console.log('[DB] Seeded 5 starter prospects.');
}

// ── Query helpers ─────────────────────────────────────────────────────────────

function getAllProspects(status = null) {
  if (status) {
    return db.prepare('SELECT * FROM prospects WHERE status = ? ORDER BY created_at DESC').all(status);
  }
  return db.prepare('SELECT * FROM prospects ORDER BY created_at DESC').all();
}

function getProspectById(id) {
  return db.prepare('SELECT * FROM prospects WHERE id = ?').get(id);
}

function getProspectByEmail(email) {
  return db.prepare('SELECT * FROM prospects WHERE email = ?').get(email);
}

function createProspect(data) {
  const stmt = db.prepare(`
    INSERT INTO prospects (name, organization, type, email, contact_name, contact_title, notes, next_send_date)
    VALUES (@name, @organization, @type, @email, @contact_name, @contact_title, @notes, @next_send_date)
  `);
  const today = new Date().toISOString().split('T')[0];
  const info = stmt.run({ ...data, next_send_date: data.next_send_date || today });
  return db.prepare('SELECT * FROM prospects WHERE id = ?').get(info.lastInsertRowid);
}

function updateProspect(id, data) {
  const allowed = ['name','organization','type','email','contact_name','contact_title',
                   'status','sequence_step','paused','last_contacted','next_send_date','notes'];
  const fields = Object.keys(data).filter(k => allowed.includes(k));
  if (!fields.length) return;
  const set = fields.map(f => `${f} = @${f}`).join(', ');
  db.prepare(`UPDATE prospects SET ${set} WHERE id = @id`).run({ ...data, id });
}

function deleteProspect(id) {
  db.prepare('DELETE FROM prospects WHERE id = ?').run(id);
}

function getDueProspects() {
  const today = new Date().toISOString().split('T')[0];
  return db.prepare(`
    SELECT * FROM prospects
    WHERE status NOT IN ('replied','booked','unsubscribed')
      AND paused = 0
      AND sequence_step < 5
      AND (next_send_date IS NULL OR next_send_date <= ?)
    ORDER BY next_send_date ASC
  `).all(today);
}

function recordSentEmail(prospectId, step, subject, body, messageId = null) {
  db.prepare(`
    INSERT INTO sent_emails (prospect_id, step, subject, body, message_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(prospectId, step, subject, body, messageId);
}

function getSentEmailsToday() {
  const today = new Date().toISOString().split('T')[0];
  return db.prepare(
    "SELECT COUNT(*) as n FROM sent_emails WHERE date(sent_at) = ?"
  ).get(today).n;
}

function getSentEmailsThisWeek() {
  return db.prepare(
    "SELECT COUNT(*) as n FROM sent_emails WHERE sent_at >= datetime('now', '-7 days')"
  ).get().n;
}

function getOpenReplies() {
  return db.prepare(
    "SELECT COUNT(*) as n FROM replies WHERE action_taken IS NULL"
  ).get().n;
}

function getBookedCount() {
  return db.prepare(
    "SELECT COUNT(*) as n FROM prospects WHERE status = 'booked'"
  ).get().n;
}

function recordReply(prospectId, replyText, graphMessageId, suggestedResponse = null) {
  try {
    db.prepare(`
      INSERT INTO replies (prospect_id, reply_text, graph_message_id, suggested_response)
      VALUES (?, ?, ?, ?)
    `).run(prospectId, replyText, graphMessageId, suggestedResponse);
  } catch (e) {
    if (!e.message.includes('UNIQUE constraint')) throw e;
  }
}

function getAllReplies() {
  return db.prepare(`
    SELECT r.*, p.name, p.organization, p.email, p.contact_name, p.type
    FROM replies r
    JOIN prospects p ON p.id = r.prospect_id
    ORDER BY r.received_at DESC
  `).all();
}

function updateReplyAction(replyId, action) {
  db.prepare('UPDATE replies SET action_taken = ? WHERE id = ?').run(action, replyId);
}

function getLinkedInPosts(status = null) {
  if (status) {
    return db.prepare('SELECT * FROM linkedin_posts WHERE status = ? ORDER BY created_at DESC').all(status);
  }
  return db.prepare('SELECT * FROM linkedin_posts ORDER BY created_at DESC').all();
}

function createLinkedInPost(postType, content, weekOf) {
  const info = db.prepare(
    'INSERT INTO linkedin_posts (post_type, content, week_of) VALUES (?, ?, ?)'
  ).run(postType, content, weekOf);
  return db.prepare('SELECT * FROM linkedin_posts WHERE id = ?').get(info.lastInsertRowid);
}

function updateLinkedInPost(id, data) {
  const allowed = ['content', 'status'];
  const fields = Object.keys(data).filter(k => allowed.includes(k));
  if (!fields.length) return;
  const set = fields.map(f => `${f} = @${f}`).join(', ');
  db.prepare(`UPDATE linkedin_posts SET ${set} WHERE id = @id`).run({ ...data, id });
}

function logActivity(action, details = null) {
  db.prepare('INSERT INTO activity_log (action, details) VALUES (?, ?)').run(action, details);
}

function getRecentActivity(limit = 10) {
  return db.prepare(
    'SELECT * FROM activity_log ORDER BY created_at DESC LIMIT ?'
  ).all(limit);
}

function getConfig(key) {
  const row = db.prepare('SELECT value FROM system_config WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setConfig(key, value) {
  db.prepare(
    'INSERT INTO system_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, String(value));
}

function getPipelineCounts() {
  const rows = db.prepare(
    "SELECT status, COUNT(*) as count FROM prospects GROUP BY status"
  ).all();
  const counts = { new: 0, contacted: 0, engaged: 0, replied: 0, booked: 0, unsubscribed: 0 };
  for (const r of rows) counts[r.status] = r.count;
  return counts;
}

function getPipelineMovements(since) {
  return db.prepare(`
    SELECT p.name, p.organization, p.status
    FROM activity_log a
    JOIN prospects p ON p.id = CAST(json_extract(a.details,'$.prospect_id') AS INTEGER)
    WHERE a.action = 'status_changed' AND a.created_at >= ?
    LIMIT 20
  `).all(since);
}

function unsubscribeProspect(id) {
  db.prepare(
    "UPDATE prospects SET status = 'unsubscribed', paused = 1 WHERE id = ?"
  ).run(id);
}

module.exports = {
  db,
  getAllProspects,
  getProspectById,
  getProspectByEmail,
  createProspect,
  updateProspect,
  deleteProspect,
  getDueProspects,
  recordSentEmail,
  getSentEmailsToday,
  getSentEmailsThisWeek,
  getOpenReplies,
  getBookedCount,
  recordReply,
  getAllReplies,
  updateReplyAction,
  getLinkedInPosts,
  createLinkedInPost,
  updateLinkedInPost,
  logActivity,
  getRecentActivity,
  getConfig,
  setConfig,
  getPipelineCounts,
  getPipelineMovements,
  unsubscribeProspect,
};
