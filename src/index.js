require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const express = require('express');
const cors    = require('cors');
const path    = require('path');

const apiRouter           = require('./routes/api');
const { parseUnsubToken } = require('./email/emailEngine');
const db                  = require('./db/database');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Unsubscribe endpoint ──────────────────────────────────────────────────────

app.get('/unsubscribe', (req, res) => {
  const { token } = req.query;
  if (!token) {
    return res.status(400).send(unsubPage('Invalid link', 'This unsubscribe link is missing a token.', false));
  }

  const prospectId = parseUnsubToken(token);
  if (!prospectId) {
    return res.status(400).send(unsubPage('Invalid link', 'This unsubscribe link is invalid or expired.', false));
  }

  const prospect = db.getProspectById(prospectId);
  if (!prospect) {
    return res.status(404).send(unsubPage('Not found', 'We could not find your record.', false));
  }

  if (prospect.status === 'unsubscribed') {
    return res.send(unsubPage('Already unsubscribed', `${prospect.organization} is already removed from our list.`, true));
  }

  db.unsubscribeProspect(prospectId);
  db.logActivity('unsubscribed', JSON.stringify({ prospect_id: prospectId, org: prospect.organization }));

  res.send(unsubPage(
    'Successfully unsubscribed',
    `${prospect.organization} has been removed from all Simtura.ai outreach. You will not receive any further emails.`,
    true
  ));
});

function unsubPage(title, message, success) {
  const color = success ? '#10b981' : '#ef4444';
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${title} — Simtura.ai</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8fafc; margin: 0; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: #fff; border-radius: 12px; padding: 48px 40px; max-width: 480px; text-align: center; box-shadow: 0 4px 24px rgba(0,0,0,.08); }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h1 { font-size: 22px; color: #0F172A; margin: 0 0 12px; }
    p { font-size: 15px; color: #64748b; line-height: 1.6; margin: 0; }
    .dot { width: 12px; height: 12px; border-radius: 50%; background: ${color}; display: inline-block; margin-right: 8px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${success ? '✅' : '❌'}</div>
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
}

// ── API routes ────────────────────────────────────────────────────────────────

app.use('/api', apiRouter);

// ── Catch-all → SPA ──────────────────────────────────────────────────────────

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n┌─────────────────────────────────────────┐`);
  console.log(`│   Simtura Leads running on port ${PORT}     │`);
  console.log(`│   Dashboard: http://localhost:${PORT}       │`);
  console.log(`└─────────────────────────────────────────┘\n`);

  // Start the embedded cron scheduler
  try {
    const { startScheduler } = require('./scheduler');
    startScheduler();
  } catch (err) {
    console.error('[Scheduler] Failed to start:', err.message);
  }
});
