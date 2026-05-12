const express = require('express');
const router  = express.Router();

router.get('/summary', async (req, res) => {
  if (!process.env.STRIPE_SECRET_KEY) {
    return res.json({ configured: false });
  }

  try {
    const Stripe = require('stripe');
    const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

    const [subs, charges, customers] = await Promise.all([
      stripe.subscriptions.list({ status: 'active', limit: 100 }),
      stripe.charges.list({ limit: 10 }),
      stripe.customers.list({ limit: 1 }),
    ]);

    const mrr = subs.data.reduce((sum, s) => {
      const amount = s.items.data[0]?.price?.unit_amount || 0;
      const interval = s.items.data[0]?.price?.recurring?.interval;
      return sum + (interval === 'year' ? amount / 12 : amount);
    }, 0) / 100;

    const recent = charges.data.map(c => ({
      id: c.id,
      amount: c.amount / 100,
      currency: c.currency.toUpperCase(),
      description: c.description || c.billing_details?.name || 'Charge',
      date: new Date(c.created * 1000).toISOString().split('T')[0],
      status: c.status,
    }));

    res.json({
      configured: true,
      mrr: Math.round(mrr),
      activeSubscriptions: subs.data.length,
      totalCustomers: customers.has_more ? '100+' : customers.data.length,
      recentCharges: recent,
    });
  } catch (err) {
    res.json({ configured: false, error: err.message });
  }
});

module.exports = router;
