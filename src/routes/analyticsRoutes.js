const express = require('express');
const fetch   = require('node-fetch');
const router  = express.Router();

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
  if (!data.access_token) throw new Error(data.error_description || 'Token refresh failed');

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
  const propertyId = process.env.GA4_PROPERTY_ID;

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

    if (overview.error) throw new Error(overview.error.message);

    const totals = parseTotals(overview);

    res.json({
      configured: true,
      kpis: {
        users:      totals[0] || 0,
        sessions:   totals[1] || 0,
        views:      totals[2] || 0,
        engagement: Math.round((totals[3] || 0) * 100),
        bounce:     Math.round((totals[4] || 0) * 100),
        newUsers:   totals[5] || 0,
      },
      timeline: parseRows(timeline).map(r => ({ date: r.dims[0], users: r.metrics[0], sessions: r.metrics[1] })),
      sources:  parseRows(sources).map(r => ({ channel: r.dims[0], sessions: r.metrics[0] })),
      devices:  parseRows(devices).map(r => ({ device: r.dims[0], sessions: r.metrics[0] })),
      pages:    parseRows(pages).map(r => ({ path: r.dims[0], views: r.metrics[0], engagement: Math.round(r.metrics[1] * 100) })),
      cities:   parseRows(cities).map(r => ({ city: r.dims[0], users: r.metrics[0] })),
    });
  } catch (err) {
    console.error('[GA4]', err.message);
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
