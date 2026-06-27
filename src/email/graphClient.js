const nodemailer = require('nodemailer');
const fetch = require('node-fetch');

// ── Transporter (lazy-init) ───────────────────────────────────────────────────

let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;
  const { GMAIL_USER, GMAIL_APP_PASSWORD } = process.env;
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    throw new Error('GMAIL_USER and GMAIL_APP_PASSWORD must be set in environment variables.');
  }
  _transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  });
  return _transporter;
}

// ── Send ──────────────────────────────────────────────────────────────────────

async function sendMail({ to, subject, htmlBody }) {
  const transporter = getTransporter();
  await transporter.sendMail({
    from: `Yousef Radwan <${process.env.GMAIL_USER}>`,
    to,
    subject,
    html: htmlBody,
  });
}

// ── Reply detection — still uses Microsoft Graph if configured, else stub ─────

async function getInboxMessages({ since = null, maxItems = 50 } = {}) {
  const { MS_CLIENT_ID, MS_CLIENT_SECRET, MS_TENANT_ID, MS_USER_EMAIL } = process.env;
  if (!MS_CLIENT_ID || !MS_CLIENT_SECRET || !MS_TENANT_ID || !MS_USER_EMAIL) {
    return []; // reply detection disabled if Graph not configured
  }

  // Reuse Graph token for reply detection only
  const tokenRes = await fetch(
    `https://login.microsoftonline.com/${MS_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     MS_CLIENT_ID,
        client_secret: MS_CLIENT_SECRET,
        scope:         'https://graph.microsoft.com/.default',
        grant_type:    'client_credentials',
      }).toString(),
    }
  );
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) return [];

  let url = `/users/${encodeURIComponent(MS_USER_EMAIL)}/mailFolders/inbox/messages` +
            `?$top=${maxItems}&$orderby=receivedDateTime desc` +
            `&$select=id,subject,from,receivedDateTime,bodyPreview,body`;
  if (since) url += `&$filter=receivedDateTime gt ${since}`;

  const res = await fetch(`https://graph.microsoft.com/v1.0${url}`, {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  const data = await res.json();
  return data?.value || [];
}

async function checkConnection() {
  try {
    const transporter = getTransporter();
    await transporter.verify();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = { sendMail, getInboxMessages, checkConnection };
