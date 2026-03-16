export default async function handler(req, res) {
  try {
    const r = await fetch('https://api.mercadolibre.com/sites/MLA', {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
    });
    const data = await r.text();
    res.json({ status: 'ok', ml_status: r.status, ml_response: data.substring(0, 200) });
  } catch (e) {
    res.json({ status: 'error', detail: e.message });
  }
}
