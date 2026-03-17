const https = require('https');

function httpPost(url, body) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const data = typeof body === 'string' ? body : JSON.stringify(body);
    const opts = {
      hostname: urlObj.hostname,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(data),
      },
    };
    const req = https.request(opts, (resp) => {
      let result = '';
      resp.on('data', c => result += c);
      resp.on('end', () => {
        try { resolve({ status: resp.statusCode, data: JSON.parse(result) }); }
        catch(e) { resolve({ status: resp.statusCode, data: result }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function httpReq(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const opts = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {},
    };
    const req = https.request(opts, (resp) => {
      let data = '';
      resp.on('data', c => data += c);
      resp.on('end', () => {
        try { resolve({ status: resp.statusCode, data: JSON.parse(data) }); }
        catch(e) { resolve({ status: resp.statusCode, data }); }
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

const CLIENT_ID = '5245450773314516';
const CLIENT_SECRET = 'x6PsOCHgfY8kFsJicwuOuHcy2DhMV8nH';
const SUPABASE_URL = 'https://ysynltkotzizayjtoujf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlzeW5sdGtvdHppemF5anRvdWpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU2MzM1MjksImV4cCI6MjA4MTIwOTUyOX0.-rSFZIILSIwPWIRW-frMm27_wRsIOK79Txz5alE6QUE';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // Get current token from Supabase
    const { status, data } = await httpReq(
      `${SUPABASE_URL}/rest/v1/ml_tokens?id=eq.default&select=*`,
      { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` } }
    );

    if (status !== 200 || !Array.isArray(data) || data.length === 0) {
      return res.status(500).json({ error: 'No token found in Supabase' });
    }

    const current = data[0];
    const elapsed = (Date.now() - current.saved_at) / 1000;
    const isExpired = elapsed >= current.expires_in - 300;

    // If not expired, just return it
    if (!isExpired) {
      return res.json({
        access_token: current.access_token,
        expired: false,
        elapsed_s: Math.round(elapsed),
        expires_in: current.expires_in,
        message: 'Token still valid'
      });
    }

    // Refresh the token
    console.log('[ML-REFRESH] Token expired, refreshing...');
    const body = `grant_type=refresh_token&client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&refresh_token=${current.refresh_token}`;
    const tokenResp = await httpPost('https://api.mercadolibre.com/oauth/token', body);

    if (tokenResp.status !== 200 || !tokenResp.data.access_token) {
      return res.status(500).json({
        error: 'Failed to refresh token',
        ml_status: tokenResp.status,
        ml_error: tokenResp.data,
        hint: 'Visit /api/ml-auth to re-authorize'
      });
    }

    const newToken = tokenResp.data;

    // Save refreshed token to Supabase
    const upsertBody = JSON.stringify({
      id: 'default',
      access_token: newToken.access_token,
      refresh_token: newToken.refresh_token,
      token_type: newToken.token_type,
      expires_in: newToken.expires_in,
      user_id: newToken.user_id,
      saved_at: Date.now(),
    });

    await httpReq(
      `${SUPABASE_URL}/rest/v1/ml_tokens?on_conflict=id`,
      {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates',
        },
        body: upsertBody,
      }
    );

    console.log('[ML-REFRESH] Token refreshed and saved');

    return res.json({
      access_token: newToken.access_token,
      expired: false,
      refreshed: true,
      expires_in: newToken.expires_in,
      message: 'Token refreshed successfully'
    });

  } catch(e) {
    console.error('[ML-REFRESH] Error:', e);
    return res.status(500).json({ error: e.message });
  }
};
