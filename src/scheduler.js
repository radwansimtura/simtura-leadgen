// Only load .env when running as a standalone script (Render cron service).
// When required by index.js, dotenv is already loaded by the parent.
if (require.main === module) {
  try {
    require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
  } catch { /* dotenv optional in production where env vars are injected */ }
}

const cron = require('node-cron');
const { processDailyEmails } = require('./email/emailEngine');
const { checkForReplies }    = require('./email/replyDetector');
const { generateWeeklyPosts } = require('./linkedin/generator');
const { sendDailyDigest }    = require('./digest');
const db                     = require('./db/database');

let _jobRunning = false;

async function runDailyJob() {
  if (_jobRunning) {
    console.log('[Scheduler] Job already in progress — skipping concurrent run.');
    return;
  }
  _jobRunning = true;

  console.log('\n[Scheduler] ══════════════════════════════════════════');
  console.log('[Scheduler] Daily job started at', new Date().toISOString());

  const today = new Date().toISOString().split('T')[0];

  // Guard: only run once per day
  const lastRunDate = db.getConfig('last_run_date');
  if (lastRunDate === today) {
    console.log('[Scheduler] Already ran today — exiting.');
    _jobRunning = false;
    return;
  }

  // Reset today's counter
  db.setConfig('emails_sent_today', '0');

  let emailResults  = { sent: 0, skipped: 0, errors: 0 };
  let replyResults  = { found: 0 };
  let linkedInCount = 0;

  // 1. Process outbound emails
  console.log('[Scheduler] Processing outbound emails…');
  try {
    emailResults = await processDailyEmails();
  } catch (err) {
    console.error('[Scheduler] Email processing error:', err.message);
    emailResults.errors++;
  }

  // 2. Check for replies
  console.log('[Scheduler] Checking for replies…');
  try {
    replyResults = await checkForReplies();
  } catch (err) {
    console.error('[Scheduler] Reply detection error:', err.message);
  }

  // 3. Monday: generate LinkedIn posts
  const dayOfWeek = new Date().getDay(); // 0=Sun, 1=Mon
  if (dayOfWeek === 1) {
    console.log('[Scheduler] Monday — generating LinkedIn posts…');
    try {
      const posts = await generateWeeklyPosts();
      linkedInCount = posts.length;
    } catch (err) {
      console.error('[Scheduler] LinkedIn generation error:', err.message);
    }
  }

  // 4. Send digest
  console.log('[Scheduler] Sending daily digest…');
  try {
    await sendDailyDigest({ emailResults, replyResults, linkedInGenerated: linkedInCount });
  } catch (err) {
    console.error('[Scheduler] Digest send error:', err.message);
  }

  // 5. Update run state
  db.setConfig('last_run', new Date().toISOString());
  db.setConfig('last_run_date', today);
  db.setConfig('emails_sent_today', String(emailResults.sent));
  db.logActivity('scheduler_ran', JSON.stringify({ emailResults, replyResults }));

  console.log('[Scheduler] Daily job complete.');
  console.log('[Scheduler] ══════════════════════════════════════════\n');
  _jobRunning = false;
}

// Schedule: every day at 08:00 in the server's local timezone
const scheduleExpr = '0 8 * * *';

if (require.main === module) {
  // Running as standalone process (Render cron service)
  runDailyJob()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('[Scheduler] Fatal error:', err);
      process.exit(1);
    });
} else {
  // Embedded in Express server — export scheduler starter
  function startScheduler() {
    console.log('[Scheduler] Cron registered:', scheduleExpr);
    cron.schedule(scheduleExpr, runDailyJob, { timezone: 'America/New_York' });
  }

  module.exports = { startScheduler, runDailyJob };
}
