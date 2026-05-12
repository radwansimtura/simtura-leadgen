const Anthropic = require('@anthropic-ai/sdk');
const { sendMail } = require('./graphClient');
const { STEP_PROMPTS, STEP_INTERVALS } = require('./templates');
const db = require('../db/database');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';

// ── Token helpers ─────────────────────────────────────────────────────────────

const UNSUB_SALT = 'simtura-unsub-v1';

function makeUnsubToken(prospectId) {
  return Buffer.from(`${UNSUB_SALT}:${prospectId}`).toString('base64url');
}

function parseUnsubToken(token) {
  try {
    const decoded = Buffer.from(token, 'base64url').toString();
    const [salt, id] = decoded.split(':');
    if (salt !== UNSUB_SALT) return null;
    const num = parseInt(id, 10);
    return isNaN(num) ? null : num;
  } catch {
    return null;
  }
}

// ── Email HTML wrapper ────────────────────────────────────────────────────────

function wrapHtml(plainTextBody, prospectId) {
  const baseUrl  = process.env.BASE_URL || 'http://localhost:3000';
  const token    = makeUnsubToken(prospectId);
  const unsubUrl = `${baseUrl}/unsubscribe?token=${token}`;

  const paragraphs = plainTextBody
    .split(/\n\n+/)
    .map(p => `<p style="margin:0 0 14px 0;line-height:1.6;">${p.trim().replace(/\n/g, '<br>')}</p>`)
    .join('\n');

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;color:#1a1a2e;max-width:600px;margin:0 auto;padding:32px 24px;">
  ${paragraphs}
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0 20px;">
  <p style="font-size:12px;color:#9ca3af;line-height:1.5;margin:0;">
    You're receiving this because your organization is a potential partner for Simtura.ai.<br>
    To stop receiving these emails, <a href="${unsubUrl}" style="color:#6366F1;">click here to unsubscribe</a>.
    This email was sent in compliance with CAN-SPAM Act requirements.
    <br>Simtura.ai · United States
  </p>
</body>
</html>`;
}

// ── AI email generation ───────────────────────────────────────────────────────

async function generateEmail(prospect, step) {
  const promptFn = STEP_PROMPTS[step];
  if (!promptFn) throw new Error(`No template for step ${step}`);

  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [
      { role: 'user', content: promptFn(prospect) },
    ],
  });

  const raw = message.content[0].text.trim();

  // Strip markdown code fences if Claude wraps the JSON
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    // Fallback: extract JSON from the response
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error(`Claude returned non-JSON for step ${step}: ${raw.slice(0, 200)}`);
  }
}

// ── Generate preview of next email without sending ───────────────────────────

async function previewNextEmail(prospectId) {
  const prospect = db.getProspectById(prospectId);
  if (!prospect) throw new Error('Prospect not found');

  const nextStep = prospect.sequence_step + 1;
  if (nextStep > 5) return null;

  const { subject, body } = await generateEmail(prospect, nextStep);
  return { step: nextStep, subject, body };
}

// ── Add days to a date string ─────────────────────────────────────────────────

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

// ── Send a single sequence email ──────────────────────────────────────────────

async function sendSequenceEmail(prospect) {
  const nextStep = prospect.sequence_step + 1;
  if (nextStep > 5) return { skipped: true, reason: 'sequence complete' };

  const { subject, body } = await generateEmail(prospect, nextStep);
  const htmlBody = wrapHtml(body, prospect.id);

  let messageId = null;
  try {
    await sendMail({ to: prospect.email, subject, htmlBody });
    messageId = `step${nextStep}-${prospect.id}-${Date.now()}`;
  } catch (err) {
    console.error(`[Email] Failed to send to ${prospect.email}:`, err.message);
    throw err;
  }

  // Persist the sent email
  db.recordSentEmail(prospect.id, nextStep, subject, body, messageId);

  // Advance sequence step
  const today = new Date().toISOString().split('T')[0];
  const interval   = STEP_INTERVALS[nextStep];
  const nextSendDate = interval ? addDays(today, interval) : null;

  db.updateProspect(prospect.id, {
    sequence_step:  nextStep,
    status:         nextStep === 1 ? 'contacted' : prospect.status === 'new' ? 'contacted' : prospect.status,
    last_contacted: today,
    next_send_date: nextSendDate,
  });

  db.logActivity(
    'email_sent',
    JSON.stringify({ prospect_id: prospect.id, org: prospect.organization, step: nextStep })
  );

  return { sent: true, step: nextStep, subject };
}

// ── Daily batch processor ─────────────────────────────────────────────────────

async function processDailyEmails() {
  const limitConfig = parseInt(db.getConfig('daily_send_limit') || '50', 10);
  const sentToday   = db.getSentEmailsToday();
  const remaining   = limitConfig - sentToday;

  if (remaining <= 0) {
    console.log('[Email] Daily send limit already reached.');
    return { sent: 0, skipped: 0, errors: 0, limitReached: true };
  }

  const due = db.getDueProspects().slice(0, remaining);
  let sent = 0, skipped = 0, errors = 0;
  const BATCH = 5;

  for (let i = 0; i < due.length; i += BATCH) {
    const batch = due.slice(i, i + BATCH);
    const results = await Promise.allSettled(batch.map(p => sendSequenceEmail(p)));

    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      if (r.status === 'fulfilled') {
        if (r.value.sent) {
          sent++;
          console.log(`[Email] Sent step ${r.value.step} to ${batch[j].organization} — "${r.value.subject}"`);
        } else {
          skipped++;
        }
      } else {
        errors++;
        console.error(`[Email] Error for prospect ${batch[j].id}:`, r.reason?.message);
      }
    }

    if (i + BATCH < due.length) await new Promise(r => setTimeout(r, 500));
  }

  console.log(`[Email] Daily run complete: ${sent} sent, ${skipped} skipped, ${errors} errors.`);
  return { sent, skipped, errors, limitReached: false };
}

module.exports = { processDailyEmails, sendSequenceEmail, previewNextEmail, makeUnsubToken, parseUnsubToken };
