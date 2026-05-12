require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const express     = require('express');
const session     = require('express-session');
const helmet      = require('helmet');
const rateLimit   = require('express-rate-limit');
const path        = require('path');

const apiRouter       = require('./routes/api');
const authRouter      = require('./routes/authRoutes');
const analyticsRouter = require('./routes/analyticsRoutes');
const revenueRouter   = require('./routes/revenueRoutes');
const { requireAuth } = require('./middleware/auth');
const { parseUnsubToken } = require('./email/emailEngine');
const db              = require('./db/database');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Security headers ──────────────────────────────────────────────────────────

app.use(helmet({
  contentSecurityPolicy: false, // disabled to allow inline scripts in SPA
}));

// ── Body parsing ──────────────────────────────────────────────────────────────

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Sessions ──────────────────────────────────────────────────────────────────

app.use(session({
  secret:            process.env.SESSION_SECRET || 'simtura-command-secret-change-me',
  resave:            false,
  saveUninitialized: false,
  cookie: {
    secure:   process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge:   24 * 60 * 60 * 1000, // 24 hours
  },
}));

// ── Rate limit login ──────────────────────────────────────────────────────────

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      10,
  message:  { error: 'Too many login attempts. Try again in 15 minutes.' },
});

// ── Public routes (no auth) ───────────────────────────────────────────────────

app.use('/auth', loginLimiter, authRouter);

app.get('/unsubscribe', (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).send(unsubPage('Invalid link', 'Missing token.', false));
  const prospectId = parseUnsubToken(token);
  if (!prospectId) return res.status(400).send(unsubPage('Invalid link', 'Invalid or expired link.', false));
  const prospect = db.getProspectById(prospectId);
  if (!prospect) return res.status(404).send(unsubPage('Not found', 'Record not found.', false));
  if (prospect.status === 'unsubscribed') {
    return res.send(unsubPage('Already unsubscribed', `${prospect.organization} is already removed.`, true));
  }
  db.unsubscribeProspect(prospectId);
  db.logActivity('unsubscribed', JSON.stringify({ prospect_id: prospectId, org: prospect.organization }));
  res.send(unsubPage('Successfully unsubscribed', `${prospect.organization} has been removed from all Simtura.ai outreach.`, true));
});

// Serve login page (public)
app.get('/login', (req, res) => {
  if (req.session?.user) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// ── Protected static + API ────────────────────────────────────────────────────

app.use('/api',        requireAuth, apiRouter);
app.use('/api/analytics', requireAuth, analyticsRouter);
app.use('/api/revenue',   requireAuth, revenueRouter);

// Protected static files (serve after auth check for the SPA)
app.use(requireAuth, express.static(path.join(__dirname, 'public')));

app.get('*', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Unsubscribe page helper ───────────────────────────────────────────────────

function unsubPage(title, message, success) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${title} — Simtura.ai</title>
  <style>
    body { font-family: Inter, -apple-system, sans-serif; background: #f8fafc; margin: 0; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: #fff; border-radius: 12px; padding: 48px 40px; max-width: 480px; text-align: center; box-shadow: 0 4px 24px rgba(0,0,0,.08); }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h1 { font-size: 22px; color: #0F172A; margin: 0 0 12px; }
    p { font-size: 15px; color: #64748b; line-height: 1.6; margin: 0; }
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

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n┌─────────────────────────────────────────┐`);
  console.log(`│   Simtura Command running on port ${PORT}   │`);
  console.log(`│   Dashboard: http://localhost:${PORT}       │`);
  console.log(`└─────────────────────────────────────────┘\n`);

  try {
    const { startScheduler } = require('./scheduler');
    startScheduler();
  } catch (err) {
    console.error('[Scheduler] Failed to start:', err.message);
  }
});
