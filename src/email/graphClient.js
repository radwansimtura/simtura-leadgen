const fetch = require('node-fetch');

let cachedToken = null;
let tokenExpiry  = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const { MS_CLIENT_ID, MS_CLIENT_SECRET, MS_TENANT_ID } = process.env;
  if (!MS_CLIENT_ID || !MS_CLIENT_SECRET || !MS_TENANT_ID) {
    throw new Error('Microsoft Graph credentials not set in environment variables.');
  }

  const res = await fetch(
    `https://login.microsoftonline.com/${MS_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     MS_CLIENT_ID,
        client_secret: MS_CLIENT_SECRET,
        scope:         'https://graph.microsoft.com/.default',
        grant_type:    'client_credentials',
      }).toString(),
    }
  );

  const data = await res.json();
  if (!data.access_token) {
    throw new Error(`Graph token error: ${JSON.stringify(data)}`);
  }

  cachedToken = data.access_token;
  tokenExpiry  = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken;
}

async function graphRequest(method, path, body = null) {
  const token = await getAccessToken();
  const opts   = {
    method,
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, opts);

  if (res.status === 204 || res.status === 202) return null;
  const text = await res.text();
  if (!res.ok) throw new Error(`Graph API ${res.status} on ${method} ${path}: ${text}`);
  if (!text) return null;
  return JSON.parse(text);
}

async function sendMail({ to, subject, htmlBody, saveToSentItems = true }) {
  const userEmail = process.env.MS_USER_EMAIL;
  return graphRequest('POST', `/users/${encodeURIComponent(userEmail)}/sendMail`, {
    message: {
      subject,
      body:          { contentType: 'HTML', content: htmlBody },
      toRecipients:  [{ emailAddress: { address: to } }],
    },
    saveToSentItems,
  });
}

async function getInboxMessages({ since = null, maxItems = 50 } = {}) {
  const userEmail = process.env.MS_USER_EMAIL;
  let url = `/users/${encodeURIComponent(userEmail)}/mailFolders/inbox/messages` +
            `?$top=${maxItems}&$orderby=receivedDateTime desc` +
            `&$select=id,subject,from,receivedDateTime,bodyPreview,body`;

  if (since) {
    url += `&$filter=receivedDateTime gt ${since}`;
  }

  const data = await graphRequest('GET', url);
  return data?.value || [];
}

async function checkConnection() {
  try {
    const userEmail = process.env.MS_USER_EMAIL;
    // Uses Mail.ReadWrite permission (not User.Read.All)
    await graphRequest('GET', `/users/${encodeURIComponent(userEmail)}/mailFolders/inbox?$select=id`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = { sendMail, getInboxMessages, checkConnection };
