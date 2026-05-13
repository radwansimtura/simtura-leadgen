const express = require('express');
const router  = express.Router();

router.get('/ga', (req, res) => {
  const embedUrl = process.env.LOOKER_STUDIO_URL;
  if (!embedUrl) {
    return res.json({ configured: false });
  }
  res.json({ configured: true, embedUrl });
});

module.exports = router;
