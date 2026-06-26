const express = require('express');
const fetch   = require('node-fetch');
const db      = require('../db/database');
const router  = express.Router();

// ── Simtura.ai PostgreSQL pool (lazy-init, reused across requests) ────────────

let _simturaPool = null;
function getSimturaPool() {
  if (_simturaPool) return _simturaPool;
  const { Pool } = require('pg');
  _simturaPool = new Pool({
    connectionString: process.env.SIMTURA_DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 3,
    idleTimeoutMillis: 30000,
  });
  return _simturaPool;
}


// ── OAuth2 token cache ────────────────────────────────────────────────────────

let _tokenCache = { token: null, exp: 0 };

async function getAccessToken() {
  if (_tokenCache.token && Date.now() < _tokenCache.exp) return _tokenCache.token;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      grant_type:    'refresh_token',
    }).toString(),
  });

  const data = await res.json();
  if (!data.access_token) {
    console.error('[GA4] Token refresh failed:', JSON.stringify(data));
    throw new Error(data.error_description || data.error || 'Token refresh failed');
  }

  _tokenCache = { token: data.access_token, exp: Date.now() + 55 * 60 * 1000 };
  return data.access_token;
}

// ── GA4 Data API helper ───────────────────────────────────────────────────────

async function runReport(propertyId, body, token) {
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    }
  );
  return res.json();
}

function parseRows(report) {
  if (!report?.rows) return [];
  return report.rows.map(row => ({
    dims:    (row.dimensionValues || []).map(d => d.value),
    metrics: (row.metricValues   || []).map(m => parseFloat(m.value) || 0),
  }));
}

function parseTotals(report, idx = 0) {
  return (report?.totals?.[0]?.metricValues || []).map(m => parseFloat(m.value) || 0);
}

// ── Routes ────────────────────────────────────────────────────────────────────

// Real GA4 data — powers the custom Chart.js analytics section
router.get('/ga4', async (req, res) => {
  // Strip any "properties/" prefix or "GA4-" prefix if accidentally included
  const rawId = process.env.GA4_PROPERTY_ID || '';
  const propertyId = rawId.replace(/^properties\//i, '').replace(/^GA4-/i, '').trim();

  if (!propertyId || !process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REFRESH_TOKEN) {
    return res.json({ configured: false });
  }

  try {
    const token     = await getAccessToken();
    const dateRange = { startDate: '30daysAgo', endDate: 'today' };

    const [overview, timeline, sources, devices, pages, cities] = await Promise.all([
      runReport(propertyId, {
        dateRanges: [dateRange],
        metrics: [
          { name: 'activeUsers' },
          { name: 'sessions' },
          { name: 'screenPageViews' },
          { name: 'engagementRate' },
          { name: 'bounceRate' },
          { name: 'newUsers' },
        ],
      }, token),

      runReport(propertyId, {
        dateRanges: [dateRange],
        dimensions: [{ name: 'date' }],
        metrics:    [{ name: 'activeUsers' }, { name: 'sessions' }],
        orderBys:   [{ dimension: { dimensionName: 'date' } }],
      }, token),

      runReport(propertyId, {
        dateRanges: [dateRange],
        dimensions: [{ name: 'sessionDefaultChannelGroup' }],
        metrics:    [{ name: 'sessions' }],
        orderBys:   [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: 8,
      }, token),

      runReport(propertyId, {
        dateRanges: [dateRange],
        dimensions: [{ name: 'deviceCategory' }],
        metrics:    [{ name: 'sessions' }],
      }, token),

      runReport(propertyId, {
        dateRanges: [dateRange],
        dimensions: [{ name: 'pagePath' }],
        metrics:    [{ name: 'screenPageViews' }, { name: 'engagementRate' }],
        orderBys:   [{ metric: { metricName: 'screenPageViews' }, desc: true }],
        limit: 8,
      }, token),

      runReport(propertyId, {
        dateRanges: [dateRange],
        dimensions: [{ name: 'city' }],
        metrics:    [{ name: 'activeUsers' }],
        orderBys:   [{ metric: { metricName: 'activeUsers' }, desc: true }],
        limit: 8,
        dimensionFilter: {
          filter: {
            fieldName:     'city',
            stringFilter:  { matchType: 'PARTIAL_REGEXP', value: '.' },
          },
        },
      }, token),
    ]);

    if (overview.error) {
      const detail = JSON.stringify(overview.error);
      console.error('[GA4] API error:', detail);
      throw new Error(`${overview.error.message} (status: ${overview.error.status}, code: ${overview.error.code})`);
    }

    // GA4 reports without dimensions return data in rows[0], not totals
    const mv = overview.rows?.[0]?.metricValues || [];
    const g  = (i) => parseFloat(mv[i]?.value || 0) || 0;

    const parsed = {
      timeline: parseRows(timeline).map(r => ({ date: r.dims[0], users: r.metrics[0], sessions: r.metrics[1] })),
      sources:  parseRows(sources).map(r => ({ channel: r.dims[0], sessions: r.metrics[0] })),
      devices:  parseRows(devices).map(r => ({ device: r.dims[0], sessions: r.metrics[0] })),
      pages:    parseRows(pages).map(r => ({ path: r.dims[0], views: r.metrics[0], engagement: Math.round(r.metrics[1] * 100) })),
      cities:   parseRows(cities).map(r => ({ city: r.dims[0], users: r.metrics[0] })),
    };

    console.log('[GA4] rows:', overview.rows?.length, '| timeline:', parsed.timeline.length, '| sources:', parsed.sources.length, '| devices:', parsed.devices.length);

    res.json({
      configured: true,
      kpis: {
        users:      g(0),
        sessions:   g(1),
        views:      g(2),
        engagement: Math.round(g(3) * 100),
        bounce:     Math.round(g(4) * 100),
        newUsers:   g(5),
      },
      ...parsed,
    });
  } catch (err) {
    console.error('[GA4]', err.message);
    res.json({ configured: true, error: err.message });
  }
});

// Real Stripe subscription data from Simtura DB
router.get('/purchases', async (req, res) => {
  if (!process.env.SIMTURA_DATABASE_URL) {
    // fallback to click tracking if DB not configured
    const all = db.getRecentActivity(5000).filter(a => a.action === 'purchase_attempt');
    const byDay = {};
    all.forEach(a => {
      const day = new Date(a.created_at).toISOString().slice(0, 10);
      byDay[day] = (byDay[day] || 0) + 1;
    });
    return res.json({ total: all.length, byDay, source: 'clicks' });
  }
  try {
    const pool = getSimturaPool();
    const [totals, daily] = await Promise.all([
      pool.query(`
        SELECT COUNT(*) AS total
        FROM users
        WHERE premium_source = 'stripe'
          AND stripe_subscription_id IS NOT NULL
      `),
      pool.query(`
        SELECT DATE(pro_since) AS day, COUNT(*) AS count
        FROM users
        WHERE premium_source = 'stripe'
          AND pro_since >= NOW() - INTERVAL '30 days'
        GROUP BY DATE(pro_since)
        ORDER BY day
      `),
    ]);
    const byDay = {};
    daily.rows.forEach(r => {
      const day = r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day);
      byDay[day] = parseInt(r.count);
    });
    res.json({ total: parseInt(totals.rows[0].total), byDay, source: 'stripe' });
  } catch (err) {
    console.error('[purchases]', err.message);
    res.json({ total: 0, byDay: {}, source: 'error', error: err.message });
  }
});

// Simtura.ai registered user signups — direct PostgreSQL query
router.get('/signups', async (req, res) => {
  if (!process.env.SIMTURA_DATABASE_URL) return res.json({ configured: false });
  try {
    const pool = getSimturaPool();
    const [totals, users, daily] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*)                                                           AS total,
          COUNT(*) FILTER (WHERE tier = 'pro')                              AS pro_count,
          COUNT(*) FILTER (WHERE tier = 'free')                             AS free_count,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')  AS last_30
        FROM users
      `),
      pool.query(`
        SELECT id, name, email, tier, created_at AS "createdAt", pro_since AS "proSince", organization_id AS "organizationId"
        FROM users
        ORDER BY created_at DESC
        LIMIT 300
      `),
      pool.query(`
        SELECT DATE(created_at) AS day, COUNT(*) AS count
        FROM users
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY DATE(created_at)
        ORDER BY day
      `),
    ]);
    const t = totals.rows[0];
    res.json({
      configured: true,
      total:     parseInt(t.total),
      proCount:  parseInt(t.pro_count),
      freeCount: parseInt(t.free_count),
      last30:    parseInt(t.last_30),
      users:     users.rows,
      daily:     daily.rows.map(r => ({
        day:   r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day),
        count: parseInt(r.count),
      })),
    });
  } catch (err) {
    console.error('[Signups]', err.message);
    res.json({ configured: true, error: err.message });
  }
});

// Upgrade a Simtura.ai user to Pro permanently
router.patch('/signups/:id/upgrade', async (req, res) => {
  if (!process.env.SIMTURA_DATABASE_URL) return res.status(503).json({ error: 'DB not configured' });
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: 'Missing id' });
  try {
    const pool = getSimturaPool();
    const result = await pool.query(
      `UPDATE users SET tier = 'pro', pro_since = NOW() WHERE id = $1 RETURNING id, email, tier`,
      [id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ ok: true, user: result.rows[0] });
  } catch (err) {
    console.error('[Signups upgrade]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Delete a Simtura.ai user account by ID
router.delete('/signups/:id', async (req, res) => {
  if (!process.env.SIMTURA_DATABASE_URL) return res.status(503).json({ error: 'DB not configured' });
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: 'Missing id' });
  try {
    const pool = getSimturaPool();
    const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id, email', [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ ok: true, deleted: result.rows[0] });
  } catch (err) {
    console.error('[Signups delete]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Scenario play analytics — queries the main Simtura.ai database
router.get('/scenarios', async (req, res) => {
  if (!process.env.SIMTURA_DATABASE_URL) return res.json({ configured: false });
  try {
    const pool = getSimturaPool();
    const [totals, perScenario, daily, dropoff] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*)                                                            AS total_attempts,
          COUNT(completed_at)                                                 AS total_completed,
          COUNT(DISTINCT user_id)                                             AS unique_users,
          ROUND(AVG(CASE WHEN completed_at IS NOT NULL THEN score END))       AS avg_score,
          COUNT(*) FILTER (WHERE ended_early = true)                          AS ended_early,
          COUNT(*) FILTER (WHERE critical_failure = true)                     AS critical_failures,
          COUNT(*) FILTER (WHERE started_at >= NOW() - INTERVAL '30 days')   AS last_30
        FROM attempts
      `),
      pool.query(`
        SELECT
          s.id,
          s.title,
          s.category,
          s.difficulty,
          s.cert_level AS "certLevel",
          COUNT(a.id)                                                                         AS attempts,
          COUNT(a.completed_at)                                                               AS completed,
          ROUND(AVG(CASE WHEN a.completed_at IS NOT NULL THEN a.score END))                  AS avg_score,
          ROUND(AVG(
            CASE WHEN a.total_steps > 0
            THEN jsonb_array_length(a.responses)::float / a.total_steps * 100
            END
          ))                                                                                  AS avg_progress,
          COUNT(*) FILTER (WHERE a.ended_early = true)                                       AS ended_early,
          COUNT(*) FILTER (WHERE a.critical_failure = true)                                  AS critical_failures
        FROM scenarios s
        LEFT JOIN attempts a ON a.scenario_id = s.id
        WHERE s.published = true
        GROUP BY s.id, s.title, s.category, s.difficulty, s.cert_level
        ORDER BY COUNT(a.id) DESC
        LIMIT 15
      `),
      pool.query(`
        SELECT DATE(started_at) AS day, COUNT(*) AS count
        FROM attempts
        WHERE started_at >= NOW() - INTERVAL '30 days'
        GROUP BY DATE(started_at)
        ORDER BY day
      `),
      pool.query(`
        SELECT
          CASE
            WHEN total_steps = 0 THEN 'unknown'
            WHEN jsonb_array_length(responses)::float / total_steps < 0.2  THEN '0–20%'
            WHEN jsonb_array_length(responses)::float / total_steps < 0.4  THEN '20–40%'
            WHEN jsonb_array_length(responses)::float / total_steps < 0.6  THEN '40–60%'
            WHEN jsonb_array_length(responses)::float / total_steps < 0.8  THEN '60–80%'
            ELSE '80–100%'
          END AS bucket,
          COUNT(*) AS count
        FROM attempts
        WHERE ended_early = true AND total_steps > 0
        GROUP BY bucket
        ORDER BY bucket
      `),
    ]);

    const t = totals.rows[0];
    const completionRate = t.total_attempts > 0
      ? Math.round(t.total_completed / t.total_attempts * 100)
      : 0;

    res.json({
      configured: true,
      totals: {
        totalAttempts:    parseInt(t.total_attempts),
        totalCompleted:   parseInt(t.total_completed),
        uniqueUsers:      parseInt(t.unique_users),
        avgScore:         parseInt(t.avg_score) || 0,
        endedEarly:       parseInt(t.ended_early),
        criticalFailures: parseInt(t.critical_failures),
        last30:           parseInt(t.last_30),
        completionRate,
      },
      scenarios: perScenario.rows.map(r => ({
        id:               r.id,
        title:            r.title,
        category:         r.category,
        difficulty:       r.difficulty,
        certLevel:        r.certLevel,
        attempts:         parseInt(r.attempts),
        completed:        parseInt(r.completed),
        avgScore:         parseInt(r.avg_score) || 0,
        avgProgress:      parseInt(r.avg_progress) || 0,
        endedEarly:       parseInt(r.ended_early),
        criticalFailures: parseInt(r.critical_failures),
        completionRate:   r.attempts > 0 ? Math.round(r.completed / r.attempts * 100) : 0,
      })),
      daily: daily.rows.map(r => ({
        day:   r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day),
        count: parseInt(r.count),
      })),
      dropoff: dropoff.rows.map(r => ({ bucket: r.bucket, count: parseInt(r.count) })),
    });
  } catch (err) {
    console.error('[Scenarios]', err.message);
    res.json({ configured: true, error: err.message });
  }
});

// Looker Studio embed URL (kept as fallback)
router.get('/ga', (req, res) => {
  const embedUrl = process.env.LOOKER_STUDIO_URL;
  if (!embedUrl) return res.json({ configured: false });
  res.json({ configured: true, embedUrl });
});

module.exports = router;
