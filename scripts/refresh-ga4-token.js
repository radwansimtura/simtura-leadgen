#!/usr/bin/env node
/**
 * Run once locally to get a fresh GOOGLE_REFRESH_TOKEN for GA4.
 *
 * Usage:
 *   GOOGLE_CLIENT_ID=xxx GOOGLE_CLIENT_SECRET=yyy node scripts/refresh-ga4-token.js
 *
 * Then paste the printed refresh token into Render → Environment → GOOGLE_REFRESH_TOKEN.
 */

const http  = require('http');
const https = require('https');
const url   = require('url');

const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI  = 'http://localhost:3333/oauth2callback';
const SCOPE         = 'https://www.googleapis.com/auth/analytics.readonly';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET before running.');
  process.exit(1);
}

const authUrl =
  `https://accounts.google.com/o/oauth2/v2/auth` +
  `?client_id=${CLIENT_ID}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&response_type=code` +
  `&scope=${encodeURIComponent(SCOPE)}` +
  `&access_type=offline` +
  `&prompt=consent`;

console.log('\nOpen this URL in your browser:\n');
console.log(authUrl);
console.log('\nWaiting for Google to redirect to localhost:3333 …\n');

const server = http.createServer(async (req, res) => {
  const { pathname, query } = url.parse(req.url, true);
  if (pathname !== '/oauth2callback') return;

  const code = query.code;
  if (!code) {
    res.end('No code received.');
    server.close();
    return;
  }

  const body = new URLSearchParams({
    code,
    client_id:     CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri:  REDIRECT_URI,
    grant_type:    'authorization_code',
  }).toString();

  const tokenReq = https.request(
    {
      hostname: 'oauth2.googleapis.com',
      path:     '/token',
      method:   'POST',
      headers:  { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
    },
    tokenRes => {
      let raw = '';
      tokenRes.on('data', d => (raw += d));
      tokenRes.on('end', () => {
        const data = JSON.parse(raw);
        if (data.refresh_token) {
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.log('New GOOGLE_REFRESH_TOKEN:');
          console.log(data.refresh_token);
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.log('\nPaste this value into Render → Environment → GOOGLE_REFRESH_TOKEN, then redeploy.');
          res.end('Done! You can close this tab.');
        } else {
          console.error('Token exchange failed:', data);
          res.end('Token exchange failed — check the terminal.');
        }
        server.close();
      });
    }
  );
  tokenReq.write(body);
  tokenReq.end();
});

server.listen(3333);
