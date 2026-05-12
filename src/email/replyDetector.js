const Anthropic = require('@anthropic-ai/sdk');
const { getInboxMessages } = require('./graphClient');
const db = require('../db/database');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';

// Generate a suggested response for an incoming reply
async function generateSuggestedResponse(prospect, replyText) {
  try {
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: `You are Yousef from Simtura.ai. You received a reply from ${prospect.contact_name || prospect.organization} at ${prospect.organization}.

Their message:
"""
${replyText.slice(0, 1000)}
"""

Write a short, warm, thoughtful response (2–3 sentences max). Be conversational.
If they expressed interest, offer a 15-minute call.
If they asked a question, answer it briefly.
If they said not interested, gracefully acknowledge and wish them well.

Return ONLY the response text — no subject line, no JSON, just the reply body.`,
      }],
    });
    return message.content[0].text.trim();
  } catch (err) {
    console.error('[Reply] Failed to generate suggested response:', err.message);
    return null;
  }
}

const BOUNCE_SENDERS = ['mailer-daemon@', 'postmaster@', 'mail-daemon@'];
const BOUNCE_SUBJECTS = ['undeliverable', 'delivery status notification', 'mail delivery failed',
  'delivery failure', 'failed delivery', 'returned mail', 'delivery has failed', 'unable to deliver'];

function isBounce(msg) {
  const from = (msg.from?.emailAddress?.address || '').toLowerCase();
  const subject = (msg.subject || '').toLowerCase();
  return BOUNCE_SENDERS.some(s => from.includes(s)) ||
         BOUNCE_SUBJECTS.some(s => subject.includes(s));
}

// Extract the original recipient email from a bounce message body
function extractBouncedEmail(body) {
  const match = body.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g);
  if (!match) return null;
  const sendingDomain = (process.env.MS_USER_EMAIL || '').split('@')[1] || 'simtura.ai';
  return match.find(e => !e.includes(sendingDomain) &&
    !e.includes('mailer-daemon') && !e.includes('postmaster')) || null;
}

// Poll inbox and match messages to known prospects
async function checkForReplies() {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  let messages;
  try {
    messages = await getInboxMessages({ since, maxItems: 100 });
  } catch (err) {
    console.error('[Reply] Failed to fetch inbox:', err.message);
    return { found: 0, bounces: 0, error: err.message };
  }

  let found = 0, bounces = 0;

  for (const msg of messages) {
    // ── Bounce detection ──────────────────────────────────────────────────────
    if (isBounce(msg)) {
      const body = msg.bodyPreview || msg.body?.content || '';
      const bouncedEmail = extractBouncedEmail(body);
      if (bouncedEmail) {
        const prospect = db.getProspectByEmail(bouncedEmail);
        if (prospect && prospect.status !== 'bounced' && prospect.status !== 'unsubscribed') {
          db.updateProspect(prospect.id, { status: 'bounced', paused: 1 });
          db.logActivity('bounced', JSON.stringify({ prospect_id: prospect.id, email: bouncedEmail }));
          console.log(`[Reply] Bounce detected — paused ${bouncedEmail}`);
          bounces++;
        }
      }
      continue;
    }

    // ── Normal reply detection ────────────────────────────────────────────────
    const fromEmail = msg.from?.emailAddress?.address?.toLowerCase();
    if (!fromEmail) continue;

    const prospect = db.getProspectByEmail(fromEmail);
    if (!prospect) continue;
    if (prospect.status === 'unsubscribed') continue;

    const existing = db.db.prepare('SELECT id FROM replies WHERE graph_message_id = ?').get(msg.id);
    if (existing) continue;

    const replyText = msg.bodyPreview || msg.body?.content || '';
    const suggestedResponse = await generateSuggestedResponse(prospect, replyText);

    db.recordReply(prospect.id, replyText, msg.id, suggestedResponse);
    db.updateProspect(prospect.id, { status: 'replied', paused: 1 });
    db.logActivity('reply_received',
      JSON.stringify({ prospect_id: prospect.id, org: prospect.organization }));

    console.log(`[Reply] Detected reply from ${prospect.organization} (${fromEmail})`);
    found++;
  }

  return { found, bounces };
}

module.exports = { checkForReplies };
