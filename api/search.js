export default async function handler(req, res) {
  const qs = new URLSearchParams(req.query).toString();

  // Try multiple ML API endpoint patterns
  const endpoints = [
    `https://api.mercadolibre.com/sites/MLA/search?${qs}`,
    `https://api.mercadolibre.com/search/MLA?${qs}`,
  ];

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'es-419,es;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Referer': 'https://www.mercadolibre.com.ar/',
    'Origin': 'https://www.mercadolibre.com.ar',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'cross-site',
    'Sec-Ch-Ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"macOS"',
    'Connection': 'keep-alive',
  };

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  let lastError = null;
  let lastStatus = 403;
  let lastBody = '';

  for (const url of endpoints) {
    try {
      const r = await fetch(url, { headers, redirect: 'follow' });
      const data = await r.text();

      if (r.status === 200) {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
        return res.status(200).send(data);
      }

      lastStatus = r.status;
      lastBody = data;
    } catch (e) {
      lastError = e.message;
    }
  }

  // If all endpoints failed, return the last response
  res.setHeader('Content-Type', 'application/json');
  if (lastError) {
    return res.status(502).json({ error: lastError, endpoints_tried: endpoints.length });
  }
  return res.status(lastStatus).send(lastBody);
}
