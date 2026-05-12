const express = require('express');
const router  = express.Router();

router.get('/ga', async (req, res) => {
  const propertyId = process.env.GA_PROPERTY_ID;
  if (!propertyId) {
    return res.json({ configured: false, message: 'Set GA_PROPERTY_ID in environment variables to enable analytics.' });
  }

  try {
    const { BetaAnalyticsDataClient } = require('@google-analytics/data');

    let client;
    if (process.env.GOOGLE_CREDENTIALS_JSON) {
      const credentials = JSON.parse(
        Buffer.from(process.env.GOOGLE_CREDENTIALS_JSON, 'base64').toString('utf8')
      );
      client = new BetaAnalyticsDataClient({ credentials });
    } else {
      client = new BetaAnalyticsDataClient(); // falls back to GOOGLE_APPLICATION_CREDENTIALS file
    }

    const [dailyRes, pagesRes, sourcesRes] = await Promise.all([
      client.runReport({
        property: `properties/${propertyId}`,
        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'date' }],
        metrics: [{ name: 'activeUsers' }],
        orderBys: [{ dimension: { dimensionName: 'date' } }],
      }),
      client.runReport({
        property: `properties/${propertyId}`,
        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'pagePath' }],
        metrics: [{ name: 'screenPageViews' }],
        orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
        limit: 10,
      }),
      client.runReport({
        property: `properties/${propertyId}`,
        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'sessionDefaultChannelGroup' }],
        metrics: [{ name: 'sessions' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      }),
    ]);

    const daily = dailyRes[0].rows?.map(r => ({
      date: r.dimensionValues[0].value,
      users: parseInt(r.metricValues[0].value),
    })) || [];

    const pages = pagesRes[0].rows?.map(r => ({
      path: r.dimensionValues[0].value,
      views: parseInt(r.metricValues[0].value),
    })) || [];

    const sources = sourcesRes[0].rows?.map(r => ({
      channel: r.dimensionValues[0].value,
      sessions: parseInt(r.metricValues[0].value),
    })) || [];

    const totalUsers = daily.reduce((a, b) => a + b.users, 0);

    res.json({ configured: true, totalUsers, daily, pages, sources });
  } catch (err) {
    res.json({ configured: false, message: `Analytics error: ${err.message}` });
  }
});

module.exports = router;
