/**
 * Imports an Apollo.io exported CSV directly into the prospects database.
 * Usage: node src/scripts/importApolloCSV.js /path/to/apollo-contacts-export.csv
 */

const fs   = require('fs');
const path = require('path');
const db   = require('../db/database');

const csvPath = process.argv[2];
if (!csvPath) {
  console.error('Usage: node src/scripts/importApolloCSV.js /path/to/file.csv');
  process.exit(1);
}

const SCHOOL_KEYWORDS = ['college', 'university', 'school', 'institute', 'academy', 'training center', 'community college'];
const AGENCY_KEYWORDS = ['fire', 'ems', 'emergency medical', 'department', 'county', 'city of', 'district', 'rescue', 'bureau', 'ambulance', 'medic'];

function detectType(orgName, industry) {
  const n = (orgName + ' ' + industry).toLowerCase();
  if (SCHOOL_KEYWORDS.some(k => n.includes(k))) return 'school';
  if (AGENCY_KEYWORDS.some(k => n.includes(k)))  return 'agency';
  if (n.includes('higher education') || n.includes('education')) return 'school';
  return 'agency';
}

function parseCSV(text) {
  const lines   = text.trim().split('\n');
  const headers = splitLine(lines[0]).map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const vals = splitLine(line);
    const obj  = {};
    headers.forEach((h, i) => { obj[h] = (vals[i] || '').trim().replace(/^"|"$/g, ''); });
    return obj;
  });
}

function splitLine(line) {
  const result = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQ = !inQ; }
    else if (ch === ',' && !inQ) { result.push(cur); cur = ''; }
    else { cur += ch; }
  }
  result.push(cur);
  return result;
}

const text    = fs.readFileSync(path.resolve(csvPath), 'utf8');
const rows    = parseCSV(text);
const existing = new Set(
  db.db.prepare('SELECT email FROM prospects').all().map(r => r.email.toLowerCase())
);

let added = 0, skipped = 0, noEmail = 0;

console.log(`\n[Apollo CSV] Found ${rows.length} rows in ${path.basename(csvPath)}\n`);

for (const row of rows) {
  const email       = (row['Email'] || '').toLowerCase().trim();
  const firstName   = row['First Name'] || '';
  const lastName    = row['Last Name']  || '';
  const contactName = `${firstName} ${lastName}`.trim();
  const title       = row['Title']        || '';
  const orgName     = row['Company Name'] || contactName;
  const industry    = row['Industry']     || '';

  if (!email || !email.includes('@')) { noEmail++; continue; }
  if (existing.has(email))            { skipped++;  continue; }

  try {
    db.createProspect({
      name:          orgName,
      organization:  orgName,
      type:          detectType(orgName, industry),
      email,
      contact_name:  contactName,
      contact_title: title,
      notes:         `Imported from Apollo.io CSV on ${new Date().toISOString().split('T')[0]}`,
    });
    existing.add(email);
    added++;
    console.log(`  ✓ ${contactName} — ${title} @ ${orgName}`);
  } catch (err) {
    if (err.message.includes('UNIQUE constraint')) { skipped++; }
    else console.error(`  ✗ Error: ${err.message}`);
  }
}

console.log(`\n[Apollo CSV] ─────────────────────────────`);
console.log(`  Added:         ${added}`);
console.log(`  Skipped (dup): ${skipped}`);
console.log(`  No email:      ${noEmail}`);
console.log(`[Apollo CSV] ─────────────────────────────\n`);

if (added > 0) db.logActivity('apollo_csv_import', JSON.stringify({ added, skipped, file: path.basename(csvPath) }));
