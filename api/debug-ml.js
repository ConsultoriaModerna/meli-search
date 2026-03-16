// Debug endpoint: fetches ML website and returns HTML preview
export const config = { runtime: 'edge', regions: ['gru1'] };

export default async function handler(request) {
  const url = new URL(request.url);
  const target = url.searchParams.get('url') || 'https://inmuebles.mercadolibre.com.ar/casas/venta/capital-federal/';

  try {
    const res = await fetch(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-AR,es;q=0.9',
      },
      redirect: 'follow',
    });

    const html = await res.text();
    const hasLdJson = html.includes('application/ld+json');
    const hasPolyCard = html.includes('poly-card');
    const hasResults = html.includes('ui-search-layout__item') || html.includes('poly-component__title');
    const hasCaptcha = html.includes('captcha') || html.includes('challenge') || html.includes('robot');
    const hasBlocked = html.includes('blocked') || html.includes('Access Denied');
    const titleMatch = html.match(/<title>([^<]*)<\/title>/);
    const totalMatch = html.match(/(\d[\d.]*)\s+resultados?/i);
    const priceCount = (html.match(/andes-money-amount/g) || []).length;
    const linkCount = (html.match(/MLA-?\d+/g) || []).length;

    return new Response(JSON.stringify({
      status: res.status,
      final_url: res.url,
      html_length: html.length,
      title: titleMatch ? titleMatch[1] : null,
      has_ld_json: hasLdJson,
      has_poly_card: hasPolyCard,
      has_results: hasResults,
      has_captcha: hasCaptcha,
      has_blocked: hasBlocked,
      total_match: totalMatch ? totalMatch[1] : null,
      price_elements: priceCount,
      mla_links: linkCount,
      html_preview: html.substring(0, 2000),
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  } catch(e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}
