/**
 * Apollo.io prospect import script.
 * Usage: node src/scripts/importApollo.js [--pages N]
 * Default: fetches up to 10 pages (250 contacts) per run.
 */

if (require.main === module) {
  try { require('dotenv').config({ path: require('path').join(__dirname, '../../.env') }); } catch {}
}

const fetch  = require('node-fetch');
const db     = require('../db/database');

const APOLLO_KEY  = process.env.APOLLO_API_KEY;
const APOLLO_URL  = 'https://api.apollo.io/v1/mixed_people/search';
const PER_PAGE    = 25;

const JOB_TITLES = [
  'Training Chief',
  'EMS Director',
  'Training Coordinator',
  'Director of Training',
  'EMS Program Director',
  'Deputy Chief Training',
  'Bureau of Training',
];

// ── Org type detection ────────────────────────────────────────────────────────

const SCHOOL_KEYWORDS = [
  'college', 'university', 'school', 'institute', 'academy',
  'training center', 'program', 'educational', 'community college',
];
const AGENCY_KEYWORDS = [
  'fire', 'ems', 'emergency medical', 'department', 'county',
  'city of', 'district', 'rescue', 'bureau', 'ambulance',
  'medic', 'paramedic', 'township', 'municipality',
];

function detectType(orgName) {
  const n = (orgName || '').toLowerCase();
  if (SCHOOL_KEYWORDS.some(k => n.includes(k))) return 'school';
  if (AGENCY_KEYWORDS.some(k => n.includes(k)))  return 'agency';
  return 'agency'; // default
}

// ── Apollo API call ───────────────────────────────────────────────────────────

async function fetchPage(page) {
  const res = await fetch(APOLLO_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
    body: JSON.stringify({
      api_key:       APOLLO_KEY,
      person_titles: JOB_TITLES,
      page,
      per_page:      PER_PAGE,
      // Only return contacts Apollo has emails for
      contact_email_status: ['verified', 'guessed', 'unverified'],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Apollo API ${res.status}: ${text.slice(0, 200)}`);
  }

  return res.json();
}

// ── Sleep helper ──────────────────────────────────────────────────────────────

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Main import logic ─────────────────────────────────────────────────────────

async function runImport({ maxPages = 10 } = {}) {
  if (!APOLLO_KEY) throw new Error('APOLLO_API_KEY is not set in environment variables.');

  // Pre-load all existing emails for fast dedup
  const existing = new Set(
    db.db.prepare('SELECT email FROM prospects').all().map(r => r.email.toLowerCase())
  );

  let added = 0, skipped = 0, noEmail = 0, errors = 0;
  let totalPages = null;

  console.log(`\n[Apollo] Starting import — up to ${maxPages} pages × ${PER_PAGE} results`);
  console.log(`[Apollo] Searching for: ${JOB_TITLES.join(', ')}\n`);

  for (let page = 1; page <= maxPages; page++) {
    if (totalPages !== null && page > totalPages) break;

    try {
      const data = await fetchPage(page);

      // Apollo returns people in either .people or .contacts depending on plan
      const people = [
        ...(data.people   || []),
        ...(data.contacts || []),
      ];

      if (totalPages === null) {
        totalPages = Math.min(data.pagination?.total_pages || 1, maxPages);
        console.log(`[Apollo] Found ${data.pagination?.total_entries || '?'} total results across ${totalPages} page(s)\n`);
      }

      for (const p of people) {
        const email   = (p.email || '').toLowerCase().trim();
        const name    = p.name  || `${p.first_name || ''} ${p.last_name || ''}`.trim();
        const orgName = p.organization?.name || p.organization_name || '';
        const title   = p.title || '';

        if (!email || !email.includes('@')) {
          noEmail++;
          continue;
        }

        if (existing.has(email)) {
          skipped++;
          continue;
        }

        try {
          db.createProspect({
            name:          orgName || name,
            organization:  orgName || name,
            type:          detectType(orgName),
            email,
            contact_name:  name,
            contact_title: title,
            notes:         `Imported from Apollo.io on ${new Date().toISOString().split('T')[0]}`,
          });

          existing.add(email); // prevent dupes within this batch
          added++;
          console.log(`  ✓ Added: ${name} — ${title} @ ${orgName} (${email})`);
        } catch (err) {
          if (err.message.includes('UNIQUE constraint')) {
            skipped++;
          } else {
            errors++;
            console.error(`  ✗ Error adding ${email}:`, err.message);
          }
        }
      }

      console.log(`[Apollo] Page ${page}/${totalPages} processed`);

      // Respect Apollo rate limit: 1 request/second
      if (page < Math.min(maxPages, totalPages || maxPages)) {
        await sleep(1100);
      }

    } catch (err) {
      console.error(`[Apollo] Page ${page} failed:`, err.message);
      errors++;
      await sleep(2000); // back off on error
    }
  }

  const summary = { added, skipped, noEmail, errors };

  console.log('\n[Apollo] ─────────────────────────────────');
  console.log(`  Added:        ${added}`);
  console.log(`  Skipped (dup): ${skipped}`);
  console.log(`  No email:      ${noEmail}`);
  console.log(`  Errors:        ${errors}`);
  console.log('[Apollo] ─────────────────────────────────\n');

  if (added > 0) {
    db.logActivity('apollo_import', JSON.stringify(summary));
  }

  return summary;
}

// ── CLI entry point ───────────────────────────────────────────────────────────

if (require.main === module) {
  const pagesArg = process.argv.indexOf('--pages');
  const maxPages = pagesArg !== -1 ? parseInt(process.argv[pagesArg + 1], 10) : 10;

  runImport({ maxPages })
    .then(s => process.exit(s.errors > 0 ? 1 : 0))
    .catch(err => { console.error('[Apollo] Fatal:', err.message); process.exit(1); });
}

module.exports = { runImport };
