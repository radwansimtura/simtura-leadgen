const express = require('express');
const bcrypt  = require('bcrypt');
const router  = express.Router();

const USERS = [
  { email: 'radwan@simtura.ai',        hash: process.env.RADWAN_PASSWORD_HASH },
  { email: 'charliesedlock@gmail.com', hash: process.env.CHARLIE_PASSWORD_HASH },
  { email: 'juju@phnproductions.com',  hash: process.env.JUJU_PASSWORD_HASH },
];

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const user = USERS.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user || !user.hash) return res.status(401).json({ error: 'Invalid credentials' });

  const ok = await bcrypt.compare(password, user.hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  req.session.user = { email: user.email };
  res.json({ ok: true, email: user.email });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/me', (req, res) => {
  if (!req.session?.user) return res.status(401).json({ error: 'Not authenticated' });
  res.json({ email: req.session.user.email });
});

module.exports = router;
