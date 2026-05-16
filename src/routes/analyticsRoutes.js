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

// Purchase attempt stats for analytics page
router.get('/purchases', (req, res) => {
  const all = db.getRecentActivity(5000).filter(a => a.action === 'purchase_attempt');
  const byDay = {};
  all.forEach(a => {
    const day = new Date(a.created_at).toISOString().slice(0, 10);
    byDay[day] = (byDay[day] || 0) + 1;
  });
  res.json({ total: all.length, byDay });
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

// Looker Studio embed URL (kept as fallback)
router.get('/ga', (req, res) => {
  const embedUrl = process.env.LOOKER_STUDIO_URL;
  if (!embedUrl) return res.json({ configured: false });
  res.json({ configured: true, embedUrl });
});

module.exports = router;
