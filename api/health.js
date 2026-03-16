export default async function handler(req, res) {
  const results = {};

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'es-419,es;q=0.9,en;q=0.8',
    'Referer': 'https://www.mercadolibre.com.ar/',
    'Origin': 'https://www.mercadolibre.com.ar',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'cross-site',
  };

  // Test 1: ML sites endpoint
  try {
    const r = await fetch('https://api.mercadolibre.com/sites/MLA', { headers });
    results.sites = { status: r.status, ok: r.status === 200 };
  } catch (e) {
    results.sites = { error: e.message };
  }

  // Test 2: ML search endpoint with minimal query
  try {
    const r = await fetch('https://api.mercadolibre.com/sites/MLA/search?q=casa&limit=1', { headers });
    const data = await r.text();
    results.search = {
      status: r.status,
      ok: r.status === 200,
      preview: data.substring(0, 300)
    };
  } catch (e) {
    results.search = { error: e.message };
  }

  // Test 3: ML categories endpoint (usually less restricted)
  try {
    const r = await fetch('https://api.mercadolibre.com/sites/MLA/categories', { headers });
    results.categories = { status: r.status, ok: r.status === 200 };
  } catch (e) {
    results.categories = { error: e.message };
  }

  const allOk = results.search?.ok;
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json({ status: allOk ? 'ok' : 'degraded', tests: results, timestamp: new Date().toISOString() });
}
