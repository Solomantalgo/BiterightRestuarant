const crypto = require('crypto');

// Cache access token in memory (within serverless instance lifetime)
let cachedAccessToken = null;
let tokenExpiry = 0;

function signJwt(key) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/analytics.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };
  
  const b64 = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const unsigned = b64(header) + '.' + b64(payload);
  
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(unsigned);
  const signature = sign.sign(key.private_key, 'base64url');
  
  return unsigned + '.' + signature;
}

async function getAccessToken(key) {
  if (cachedAccessToken && Date.now() < tokenExpiry - 60000) {
    return cachedAccessToken;
  }
  
  const jwt = signJwt(key);
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`
  });
  
  const data = await res.json();
  if (!data.access_token) {
    throw new Error('Auth failed: ' + JSON.stringify(data));
  }
  
  cachedAccessToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in * 1000);
  return cachedAccessToken;
}

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rawKey = process.env.GA_SERVICE_ACCOUNT_KEY;
  if (!rawKey) {
    return res.status(500).json({ error: 'GA_SERVICE_ACCOUNT_KEY environment variable is not configured.' });
  }

  try {
    let key;
    const trimmed = rawKey.trim();
    if (trimmed.startsWith('{')) {
      key = JSON.parse(trimmed);
    } else {
      key = JSON.parse(Buffer.from(trimmed, 'base64').toString('utf8'));
    }

    if (!key.client_email || !key.private_key) {
      return res.status(500).json({ error: 'Invalid service account key configuration.' });
    }

    const token = await getAccessToken(key);
    const PROPERTY_ID = '541574321';
    
    const requestBody = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    const apiRes = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${PROPERTY_ID}:runReport`, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    const apiData = await apiRes.json();
    if (apiData.error) {
      return res.status(apiRes.status || 500).json(apiData);
    }

    return res.status(200).json(apiData);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
