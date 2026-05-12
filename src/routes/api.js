const express = require('express');
const router  = express.Router();
const db      = require('../db/database');
const { previewNextEmail } = require('../email/emailEngine');
const { generateWeeklyPosts } = require('../linkedin/generator');
const { checkForReplies }    = require('../email/replyDetector');
const { runDailyJob }        = require('../scheduler');
const { checkConnection }    = require('../email/graphClient');
const { runImport }          = require('../scripts/importApollo');

// ── Overview ──────────────────────────────────────────────────────────────────

router.get('/overview', (req, res) => {
  res.json({
    totalProspects:   db.db.prepare('SELECT COUNT(*) as n FROM prospects').get().n,
    emailsSentWeek:   db.getSentEmailsThisWeek(),
    openReplies:      db.getOpenReplies(),
    booked:           db.getBookedCount(),
    pipeline:         db.getPipelineCounts(),
    activity:         db.getRecentActivity(10),
  });
});

// ── Prospects ─────────────────────────────────────────────────────────────────

router.get('/prospects', (req, res) => {
  const { status } = req.query;
  res.json(db.getAllProspects(status || null));
});

router.get('/prospects/:id', (req, res) => {
  const p = db.getProspectById(req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  res.json(p);
});

router.post('/prospects', (req, res) => {
  try {
    const { name, organization, type, email, contact_name, contact_title, notes } = req.body;
    if (!name || !organization || !type || !email) {
      return res.status(400).json({ error: 'name, organization, type, and email are required' });
    }
    if (!['agency', 'school'].includes(type)) {
      return res.status(400).json({ error: 'type must be "agency" or "school"' });
    }
    const p = db.createProspect({ name, organization, type, email, contact_name, contact_title, notes });
    db.logActivity('prospect_added', JSON.stringify({ prospect_id: p.id, org: p.organization }));
    res.status(201).json(p);
  } catch (err) {
    if (err.message.includes('UNIQUE constraint')) {
      return res.status(409).json({ error: 'A prospect with that email already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

router.put('/prospects/:id', (req, res) => {
  const p = db.getProspectById(req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });

  const oldStatus = p.status;
  db.updateProspect(req.params.id, req.body);

  if (req.body.status && req.body.status !== oldStatus) {
    db.logActivity('status_changed', JSON.stringify({
      prospect_id: p.id,
      org: p.organization,
      from: oldStatus,
      to: req.body.status,
    }));
  }

  res.json(db.getProspectById(req.params.id));
});

router.delete('/prospects/:id', (req, res) => {
  const p = db.getProspectById(req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  db.deleteProspect(req.params.id);
  res.json({ ok: true });
});

// Bulk import via JSON array (parsed from CSV on frontend)
router.post('/prospects/bulk', (req, res) => {
  const { prospects } = req.body;
  if (!Array.isArray(prospects) || !prospects.length) {
    return res.status(400).json({ error: 'prospects array required' });
  }

  const results = { imported: 0, skipped: 0, errors: [] };

  for (const row of prospects) {
    try {
      const { name, organization, type, email, contact_name, contact_title, notes } = row;
      if (!name || !organization || !type || !email) {
        results.skipped++;
        results.errors.push(`Missing required fields for: ${email || 'unknown'}`);
        continue;
      }
      db.createProspect({ name, organization, type, email, contact_name, contact_title, notes });
      results.imported++;
    } catch (err) {
      results.skipped++;
      results.errors.push(`${row.email || 'unknown'}: ${err.message}`);
    }
  }

  db.logActivity('bulk_import', JSON.stringify({ count: results.imported }));
  res.json(results);
});

// ── Sequence preview ──────────────────────────────────────────────────────────

router.get('/prospects/:id/preview', async (req, res) => {
  try {
    const preview = await previewNextEmail(req.params.id);
    if (!preview) return res.json({ message: 'Sequence complete — no more emails.' });
    res.json(preview);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Toggle pause/resume
router.put('/prospects/:id/pause', (req, res) => {
  const p = db.getProspectById(req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  const newPaused = p.paused ? 0 : 1;
  db.updateProspect(req.params.id, { paused: newPaused });
  db.logActivity(newPaused ? 'sequence_paused' : 'sequence_resumed',
    JSON.stringify({ prospect_id: p.id, org: p.organization }));
  res.json({ paused: Boolean(newPaused) });
});

// ── Replies ───────────────────────────────────────────────────────────────────

router.get('/replies', (req, res) => {
  res.json(db.getAllReplies());
});

router.put('/replies/:id/action', (req, res) => {
  const { action, prospectId } = req.body;
  if (!action) return res.status(400).json({ error: 'action required' });

  db.updateReplyAction(req.params.id, action);

  if (prospectId) {
    const statusMap = {
      booked:  'booked',
      nurture: 'engaged',
      archive: 'engaged',
    };
    const newStatus = statusMap[action];
    if (newStatus) {
      db.updateProspect(prospectId, { status: newStatus, paused: action === 'booked' ? 1 : 0 });
      db.logActivity('status_changed', JSON.stringify({ prospect_id: prospectId, to: newStatus }));
    }
  }

  res.json({ ok: true });
});

// ── LinkedIn ──────────────────────────────────────────────────────────────────

router.get('/linkedin', (req, res) => {
  res.json(db.getLinkedInPosts());
});

router.put('/linkedin/:id', (req, res) => {
  const { content, status } = req.body;
  db.updateLinkedInPost(req.params.id, { content, status });
  res.json(db.db.prepare('SELECT * FROM linkedin_posts WHERE id = ?').get(req.params.id));
});

router.put('/linkedin/:id/approve', (req, res) => {
  db.updateLinkedInPost(req.params.id, { status: 'approved' });
  db.logActivity('linkedin_approved', JSON.stringify({ post_id: req.params.id }));
  res.json({ ok: true });
});

router.post('/linkedin/generate', async (req, res) => {
  try {
    const posts = await generateWeeklyPosts();
    res.json({ generated: posts.length, posts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Settings ──────────────────────────────────────────────────────────────────

router.get('/settings', (req, res) => {
  res.json({
    daily_send_limit: db.getConfig('daily_send_limit'),
    schedule_time:    db.getConfig('schedule_time'),
    operator_email:   process.env.OPERATOR_EMAIL || '',
    base_url:         process.env.BASE_URL || '',
  });
});

router.put('/settings', (req, res) => {
  const { daily_send_limit, schedule_time } = req.body;
  if (daily_send_limit) db.setConfig('daily_send_limit', daily_send_limit);
  if (schedule_time)    db.setConfig('schedule_time', schedule_time);
  res.json({ ok: true });
});

router.get('/status', async (req, res) => {
  const msStatus    = await checkConnection();
  const anthropicOk = Boolean(process.env.ANTHROPIC_API_KEY);

  res.json({
    last_run:          db.getConfig('last_run') || 'Never',
    emails_sent_today: db.getConfig('emails_sent_today') || '0',
    microsoft_graph:   msStatus,
    anthropic:         { ok: anthropicOk },
  });
});

// ── Manual trigger (for testing) ─────────────────────────────────────────────

router.post('/run-now', async (req, res) => {
  // Remove the date guard so it runs even if already ran today
  db.setConfig('last_run_date', '');
  try {
    await runDailyJob();
    res.json({ ok: true, message: 'Daily job completed.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Apollo import ─────────────────────────────────────────────────────────────

router.post('/import-apollo', async (req, res) => {
  const maxPages = parseInt(req.body.maxPages || '10', 10);
  if (!process.env.APOLLO_API_KEY) {
    return res.status(400).json({ error: 'APOLLO_API_KEY is not set in environment variables.' });
  }
  try {
    const result = await runImport({ maxPages });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Activity ──────────────────────────────────────────────────────────────────

router.get('/activity', (req, res) => {
  const limit = parseInt(req.query.limit || '20', 10);
  res.json(db.getRecentActivity(limit));
});

module.exports = router;
