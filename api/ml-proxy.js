const https = require('https');

function httpReq(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const opts = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        ...options.headers,
      },
    };
    const req = https.request(opts, (resp) => {
      let data = '';
      resp.on('data', c => data += c);
      resp.on('end', () => {
        try { resolve({ status: resp.statusCode, data: JSON.parse(data) }); }
        catch(e) { resolve({ status: resp.statusCode, data, raw: true }); }
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

const SUPABASE_URL = 'https://ysynltkotzizayjtoujf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlzeW5sdGtvdHppemF5anRvdWpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU2MzM1MjksImV4cCI6MjA4MTIwOTUyOX0.-rSFZIILSIwPWIRW-frMm27_wRsIOK79Txz5alE6QUE';

async function getTokenFromSupabase() {
  try {
    const { status, data } = await httpReq(
      `${SUPABASE_URL}/rest/v1/ml_tokens?id=eq.default&select=access_token,saved_at,expires_in`,
      { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` } }
    );
    if (status === 200 && Array.isArray(data) && data.length > 0) {
      const t = data[0];
      const elapsed = (Date.now() - t.saved_at) / 1000;
      if (elapsed < t.expires_in - 300) {
        console.log('[TOKEN] Valid, elapsed:', Math.round(elapsed), 's');
        return t.access_token;
      }
      console.log('[TOKEN] Expired, elapsed:', Math.round(elapsed), 's');
    }
  } catch(e) { console.error('[TOKEN]', e.message); }
  return null;
}

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-ML-Token');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { path: mlPath, ml_token, ...rest } = req.query;
  if (!mlPath) return res.status(400).json({ error: 'Missing path param', usage: '/api/ml-proxy?path=sites/MLA/search&q=casa&limit=1' });

  // Token priority: query > header > Supabase DB
  let token = ml_token || req.headers['x-ml-token'];
  if (!token) token = await getTokenFromSupabase();

  // Build ML API URL
  const params = new URLSearchParams(rest).toString();
  const mlUrl = `https://api.mercadolibre.com/${mlPath}${params ? '?' + params : ''}`;
  console.log(`[ML-PROXY] Region: ${process.env.VERCEL_REGION || 'unknown'} | ${mlUrl} | token=${token ? 'yes' : 'no'}`);

  try {
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const { status, data } = await httpReq(mlUrl, { headers });
    res.setHeader('X-Via', `vercel-${process.env.VERCEL_REGION || 'unknown'}`);
    return res.status(status).json(data);
  } catch(e) {
    return res.status(502).json({ error: e.message });
  }
};
