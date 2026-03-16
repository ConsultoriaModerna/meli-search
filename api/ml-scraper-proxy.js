// ML API proxy via ScraperAPI - routes through residential IPs
// Handles ML's anti-bot blocking by using ScraperAPI's residential proxy network
// Free tier: 5,000 requests/month

const SUPABASE_URL = 'https://ysynltkotzizayjtoujf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlzeW5sdGtvdHppemF5anRvdWpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU2MzM1MjksImV4cCI6MjA4MTIwOTUyOX0.-rSFZIILSIwPWIRW-frMm27_wRsIOK79Txz5alE6QUE';

async function getMLToken() {
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

async function getScraperApiKey() {
  try {
    const res = await fetch(
      SUPABASE_URL + '/rest/v1/ml_tokens?id=eq.scraper_api&select=access_token',
      { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY } }
    );
    if (res.ok) {
      const rows = await res.json();
      if (rows.length > 0 && rows[0].access_token) return rows[0].access_token;
    }
  } catch(e) { /* ignore */ }
  // Fallback: check environment variable
  return process.env.SCRAPER_API_KEY || null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { path: mlPath, ...rest } = req.query;
  const apiPath = mlPath || 'sites/MLA/search';

  // Remove our internal params
  delete rest.path;

  // Get ScraperAPI key
  const scraperKey = await getScraperApiKey();
  if (!scraperKey) {
    return res.status(503).json({
      error: 'ScraperAPI key not configured',
      help: 'Store your ScraperAPI key in Supabase ml_tokens table with id=scraper_api',
    });
  }

  // Get ML token for authenticated requests
  const mlToken = await getMLToken();

  // Build the target ML API URL
  const params = new URLSearchParams(rest);
  if (mlToken) params.set('access_token', mlToken);
  const targetUrl = 'https://api.mercadolibre.com/' + apiPath + '?' + params.toString();

  // Build ScraperAPI URL
  const scraperUrl = 'https://api.scraperapi.com?api_key=' + scraperKey
    + '&url=' + encodeURIComponent(targetUrl)
    + '&country_code=ar';  // Use Argentine residential IPs

  console.log('[SCRAPER-PROXY] Target:', targetUrl.substring(0, 100) + '...');
  console.log('[SCRAPER-PROXY] Via ScraperAPI, country=ar, token=' + (mlToken ? 'yes' : 'no'));

  try {
    const response = await fetch(scraperUrl, {
      headers: { 'Accept': 'application/json' },
    });

    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch(e) { data = { raw: text.substring(0, 1000) }; }

    console.log('[SCRAPER-PROXY] Status:', response.status, 'Has results:', !!(data.results));

    if (response.ok && data.results) {
      res.setHeader('X-Via', 'scraperapi-ar');
      res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
      return res.status(200).json(data);
    }

    // If ScraperAPI returned OK but ML still blocked, try without token
    if (response.ok && !data.results && mlToken) {
      console.log('[SCRAPER-PROXY] Retrying without ML token...');
      const params2 = new URLSearchParams(rest);
      const targetUrl2 = 'https://api.mercadolibre.com/' + apiPath + '?' + params2.toString();
      const scraperUrl2 = 'https://api.scraperapi.com?api_key=' + scraperKey
        + '&url=' + encodeURIComponent(targetUrl2)
        + '&country_code=ar';

      const response2 = await fetch(scraperUrl2, { headers: { 'Accept': 'application/json' } });
      const text2 = await response2.text();
      let data2;
      try { data2 = JSON.parse(text2); } catch(e) { data2 = { raw: text2.substring(0, 1000) }; }

      if (response2.ok && data2.results) {
        res.setHeader('X-Via', 'scraperapi-ar-notoken');
        return res.status(200).json(data2);
      }
    }

    // Return whatever we got
    return res.status(response.status || 502).json({
      error: 'ScraperAPI request failed',
      status: response.status,
      data: data,
    });
  } catch(e) {
    console.error('[SCRAPER-PROXY] Error:', e.message);
    return res.status(502).json({ error: e.message });
  }
}
