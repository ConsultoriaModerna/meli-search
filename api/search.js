export default async function handler(req, res) {
  const qs = new URLSearchParams(req.query).toString();
  const url = `https://api.mercadolibre.com/sites/MLA/search?${qs}`;

  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'es-AR,es;q=0.9',
      }
    });
    const data = await r.text();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 's-maxage=60');
    res.status(r.status).send(data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
}
