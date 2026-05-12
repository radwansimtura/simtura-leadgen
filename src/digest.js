const { sendMail } = require('./email/graphClient');
const db = require('./db/database');

async function sendDailyDigest({ emailResults = {}, replyResults = {}, linkedInGenerated = 0 } = {}) {
  const operatorEmail = process.env.OPERATOR_EMAIL;
  if (!operatorEmail) {
    console.log('[Digest] OPERATOR_EMAIL not set — skipping digest.');
    return;
  }

  const pipeline   = db.getPipelineCounts();
  const totalLeads = Object.values(pipeline).reduce((a, b) => a + b, 0);
  const openReplies = db.getOpenReplies();
  const drafted    = db.getLinkedInPosts('draft').length;
  const sentWeek   = db.getSentEmailsThisWeek();

  const today    = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const now      = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  const pipelineRows = [
    ['New',          pipeline.new],
    ['Contacted',    pipeline.contacted],
    ['Engaged',      pipeline.engaged],
    ['Replied',      pipeline.replied],
    ['Booked',       pipeline.booked],
    ['Unsubscribed', pipeline.unsubscribed],
  ].map(([s, n]) => `
      <tr>
        <td style="padding:8px 16px;border-bottom:1px solid #f1f5f9;">${s}</td>
        <td style="padding:8px 16px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:600;">${n}</td>
      </tr>`).join('');

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1a1a2e;max-width:600px;margin:0 auto;padding:32px 24px;background:#f8fafc;">

  <div style="background:#0F172A;border-radius:12px;padding:24px;margin-bottom:24px;">
    <h1 style="color:#fff;margin:0;font-size:20px;font-weight:700;">Simtura Leads — Daily Digest</h1>
    <p style="color:#94a3b8;margin:6px 0 0;font-size:14px;">${today} · ${now}</p>
  </div>

  <!-- Metric Cards -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px;">
    <div style="background:#fff;border-radius:10px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,.08);">
      <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.05em;font-weight:600;">Emails Sent Today</div>
      <div style="font-size:32px;font-weight:700;color:#6366F1;margin-top:6px;">${emailResults.sent || 0}</div>
      ${emailResults.errors ? `<div style="font-size:12px;color:#ef4444;margin-top:4px;">${emailResults.errors} error(s)</div>` : ''}
    </div>
    <div style="background:#fff;border-radius:10px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,.08);">
      <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.05em;font-weight:600;">New Replies</div>
      <div style="font-size:32px;font-weight:700;color:#10b981;margin-top:6px;">${replyResults.found || 0}</div>
      ${openReplies ? `<div style="font-size:12px;color:#f59e0b;margin-top:4px;">${openReplies} open reply/replies need attention</div>` : ''}
    </div>
    <div style="background:#fff;border-radius:10px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,.08);">
      <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.05em;font-weight:600;">Emails Sent This Week</div>
      <div style="font-size:32px;font-weight:700;color:#0F172A;margin-top:6px;">${sentWeek}</div>
    </div>
    <div style="background:#fff;border-radius:10px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,.08);">
      <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.05em;font-weight:600;">Total Prospects</div>
      <div style="font-size:32px;font-weight:700;color:#0F172A;margin-top:6px;">${totalLeads}</div>
    </div>
  </div>

  <!-- Pipeline -->
  <div style="background:#fff;border-radius:10px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,.08);margin-bottom:24px;">
    <h2 style="margin:0 0 16px;font-size:15px;font-weight:700;">Pipeline Breakdown</h2>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <thead>
        <tr style="background:#f8fafc;">
          <th style="padding:8px 16px;text-align:left;font-weight:600;color:#64748b;font-size:12px;text-transform:uppercase;">Stage</th>
          <th style="padding:8px 16px;text-align:right;font-weight:600;color:#64748b;font-size:12px;text-transform:uppercase;">Count</th>
        </tr>
      </thead>
      <tbody>${pipelineRows}</tbody>
    </table>
  </div>

  <!-- LinkedIn -->
  ${drafted > 0 ? `
  <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:20px;margin-bottom:24px;">
    <h2 style="margin:0 0 8px;font-size:15px;font-weight:700;color:#1d4ed8;">📋 LinkedIn Posts Ready</h2>
    <p style="margin:0;font-size:14px;color:#1e40af;">${drafted} LinkedIn post(s) are waiting for your review and approval in the dashboard.</p>
  </div>` : ''}

  <!-- Footer -->
  <p style="font-size:12px;color:#94a3b8;text-align:center;margin-top:24px;">
    Simtura Leads · <a href="${process.env.BASE_URL || 'http://localhost:3000'}" style="color:#6366F1;">Open Dashboard</a>
  </p>
</body>
</html>`;

  await sendMail({
    to: operatorEmail,
    subject: `Simtura Leads Digest — ${emailResults.sent || 0} sent, ${replyResults.found || 0} new replies`,
    htmlBody: html,
  });

  console.log(`[Digest] Sent daily digest to ${operatorEmail}`);
}

module.exports = { sendDailyDigest };
