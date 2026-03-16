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

async function getTokenFromSupabase() {
  const supabaseUrl = 'https://ysynltkotzizayjtoujf.supabase.co';
  const supabaseKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
  try {
    const { status, data } = await httpReq(
      `${supabaseUrl}/rest/v1/ml_tokens?id=eq.default&select=access_token,saved_at,expires_in`,
      { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } }
    );
    if (status === 200 && Array.isArray(data) && data.length > 0) {
      const t = data[0];
      const elapsed = (Date.now() - t.saved_at) / 1000;
      if (elapsed < t.expires_in - 300) return t.access_token;
      console.log('[TOKEN] Expired');
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
  if (!mlPath) return res.status(400).json({ error: 'Missing path param' });

  // Token: query > header > Supabase DB
  let token = ml_token || req.headers['x-ml-token'];
  if (!token) token = await getTokenFromSupabase();

  // Build ML API URL
  const params = new URLSearchParams(rest).toString();
  const mlUrl = `https://api.mercadolibre.com/${mlPath}${params ? '?' + params : ''}`;
  console.log(`[ML-PROXY-GRU1] ${mlUrl} token=${token ? 'yes' : 'no'}`);

  try {
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const { status, data } = await httpReq(mlUrl, { headers });
    res.setHeader('X-Via', 'vercel-gru1');
    return res.status(status).json(data);
  } catch(e) {
    return res.status(502).json({ error: e.message });
  }
};
