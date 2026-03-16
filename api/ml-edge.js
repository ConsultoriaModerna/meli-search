// Vercel Edge Function - runs on Vercel's Edge Network (Cloudflare-like IPs)
// Different IP ranges than serverless functions, potentially not blocked by ML

export const config = {
  runtime: 'edge',
  regions: ['gru1', 'cle1', 'iad1'], // São Paulo first, then US fallbacks
};

const SUPABASE_URL = 'https://ysynltkotzizayjtoujf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlzeW5sdGtvdHppemF5anRvdWpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU2MzM1MjksImV4cCI6MjA4MTIwOTUyOX0.-rSFZIILSIwPWIRW-frMm27_wRsIOK79Txz5alE6QUE';

async function getTokenFromSupabase() {
  try {
    const res = await fetch(
      SUPABASE_URL + '/rest/v1/ml_tokens?id=eq.default&select=access_token,saved_at,expires_in',
      { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY } }
    );
    if (res.ok) {
      const rows = await res.json();
      if (rows.length > 0) {
        const t = rows[0];
        const elapsed = (Date.now() - t.saved_at) / 1000;
        if (elapsed < t.expires_in - 300) return t.access_token;
      }
    }
  } catch(e) { /* ignore */ }
  return null;
}

export default async function handler(request) {
  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' },
    });
  }

  const url = new URL(request.url);
  const mlPath = url.searchParams.get('path') || 'sites/MLA/search';

  // Build ML API URL with all other params
  const mlParams = new URLSearchParams();
  for (const [key, value] of url.searchParams) {
    if (key !== 'path') mlParams.set(key, value);
  }

  // Get token from Supabase
  const token = await getTokenFromSupabase();

  // Build final ML URL
  const mlUrl = 'https://api.mercadolibre.com/' + mlPath + (mlParams.toString() ? '?' + mlParams.toString() : '');

  // Try multiple strategies
  const strategies = [
    // Strategy 1: With token + browser headers
    {
      name: 'token+browser',
      headers: {
        'Authorization': token ? 'Bearer ' + token : undefined,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'application/json,text/html,application/xhtml+xml',
        'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
    },
    // Strategy 2: Without token, minimal headers
    {
      name: 'no-token-minimal',
      headers: {
        'Accept': 'application/json',
      },
    },
    // Strategy 3: With token as query param
    {
      name: 'token-queryparam',
      url: token ? mlUrl + (mlUrl.includes('?') ? '&' : '?') + 'access_token=' + encodeURIComponent(token) : null,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      },
    },
  ];

  let lastStatus = 0;
  let lastBody = '';

  for (const strat of strategies) {
    const fetchUrl = strat.url || mlUrl;
    if (!fetchUrl) continue;

    // Clean undefined headers
    const cleanHeaders = {};
    for (const [k, v] of Object.entries(strat.headers)) {
      if (v !== undefined) cleanHeaders[k] = v;
    }

    try {
      const res = await fetch(fetchUrl, {
        headers: cleanHeaders,
        redirect: 'follow',
      });

      lastStatus = res.status;
      const text = await res.text();
      lastBody = text;

      if (res.ok) {
        // Success! Return the data
        let data;
        try { data = JSON.parse(text); } catch(e) { data = { raw: text }; }
        return new Response(JSON.stringify(data), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'X-Strategy': strat.name,
            'X-ML-Status': String(res.status),
          },
        });
      }
    } catch(e) {
      lastBody = e.message;
    }
  }

  // All strategies failed
  return new Response(JSON.stringify({
    error: 'All strategies failed',
    last_status: lastStatus,
    last_body: lastBody.substring(0, 500),
    token_available: !!token,
    edge_region: process.env.VERCEL_REGION || 'unknown',
  }), {
    status: lastStatus || 502,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
