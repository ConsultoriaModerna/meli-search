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
const REDIRECT_URI = 'https://meli-search-consultoriamodernas-projects.vercel.app/api/ml-callback';
const SUPABASE_URL = 'https://ysynltkotzizayjtoujf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlzeW5sdGtvdHppemF5anRvdWpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU2MzM1MjksImV4cCI6MjA4MTIwOTUyOX0.-rSFZIILSIwPWIRW-frMm27_wRsIOK79Txz5alE6QUE';

module.exports = async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    return res.status(400).send(`<html><body style="font-family:sans-serif;padding:40px;background:#0a0a1a;color:#e8e8f0"><h2 style="color:#ff3d5a">Error de autorizacion</h2><p>${error}</p><a href="/" style="color:#3483fa">Volver</a></body></html>`);
  }

  if (!code) {
    return res.status(400).send(`<html><body style="font-family:sans-serif;padding:40px;background:#0a0a1a;color:#e8e8f0"><h2 style="color:#ff3d5a">Falta el codigo</h2><p>No se recibio el codigo de autorizacion.</p><a href="/" style="color:#3483fa">Volver</a></body></html>`);
  }

  try {
    // Exchange code for token
    const body = `grant_type=authorization_code&client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&code=${code}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
    const tokenResp = await httpPost('https://api.mercadolibre.com/oauth/token', body);

    console.log('[ML-CALLBACK] Token response:', tokenResp.status, JSON.stringify(tokenResp.data));

    if (tokenResp.status !== 200 || !tokenResp.data.access_token) {
      return res.status(500).send(`<html><body style="font-family:sans-serif;padding:40px;background:#0a0a1a;color:#e8e8f0"><h2 style="color:#ff3d5a">Error obteniendo token</h2><pre>${JSON.stringify(tokenResp.data, null, 2)}</pre><a href="/" style="color:#3483fa">Volver</a></body></html>`);
    }

    const token = tokenResp.data;

    // Save to Supabase
    const upsertBody = JSON.stringify({
      id: 'default',
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      token_type: token.token_type,
      expires_in: token.expires_in,
      user_id: token.user_id,
      saved_at: Date.now(),
    });

    const saveResp = await httpReq(
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

    console.log('[ML-CALLBACK] Supabase save:', saveResp.status);

    // Quick test: try ML API with the new token
    const testResp = await httpReq(
      `https://api.mercadolibre.com/sites/MLA/search?q=casa&limit=1`,
      { headers: { 'Authorization': `Bearer ${token.access_token}` } }
    );

    const testOk = testResp.status === 200;
    const testResults = testOk && testResp.data.paging ? testResp.data.paging.total : 0;

    return res.status(200).send(`<html><body style="font-family:sans-serif;padding:40px;background:#0a0a1a;color:#e8e8f0">
      <h2 style="color:#00c853">Token obtenido con exito!</h2>
      <p><strong>User ID:</strong> ${token.user_id}</p>
      <p><strong>Expira en:</strong> ${token.expires_in / 3600} horas</p>
      <p><strong>Test API busqueda:</strong> <span style="color:${testOk ? '#00c853' : '#ff3d5a'}">${testOk ? 'OK - ' + testResults + ' resultados' : 'FALLO - Status ' + testResp.status}</span></p>
      <p style="margin-top:20px"><a href="/" style="color:#3483fa;font-size:18px">Ir a buscar!</a></p>
    </body></html>`);

  } catch(e) {
    console.error('[ML-CALLBACK] Error:', e);
    return res.status(500).send(`<html><body style="font-family:sans-serif;padding:40px;background:#0a0a1a;color:#e8e8f0"><h2 style="color:#ff3d5a">Error</h2><pre>${e.message}</pre><a href="/" style="color:#3483fa">Volver</a></body></html>`);
  }
};
