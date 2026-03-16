export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { category, operation, zone, priceMin, priceMax, currency, rooms, beds, baths, area_min, area_max, parking, sort, q, offset } = req.query;

  // Build ML website search URL
  // Pattern: https://inmuebles.mercadolibre.com.ar/{type}/{operation}/{zone}/
  const typeMap = {
    'MLA1466': 'casas', 'MLA1472': 'departamentos', 'MLA1493': 'terrenos',
    'MLA401685': 'locales-comerciales-y-oficinas', 'MLA1473': 'oficinas',
    'MLA50541': 'cocheras', 'MLA1475': 'depositos', 'MLA401701': 'ph',
    'MLA1459': '',
  };
  const opMap = { '242075': 'venta', '242073': 'alquiler', '242074': 'alquiler-temporario' };
  const zoneMap = {
    'TUxBUENBUGw3M2E1': 'capital-federal', 'TUxBUENBUGwyNzY1': 'gba-norte',
    'TUxBUENBUGwyNzY2': 'gba-oeste', 'TUxBUENBUGwyNzY3': 'gba-sur',
    'TUxBUENBUGwyODNi': 'la-plata', 'TUxBUENBUGwyMDM1': 'costa-atlantica',
  };
  const sortMap = { 'price_asc': '_OrderId_PRICE*ASC', 'price_desc': '_OrderId_PRICE*DESC', 'relevance': '' };

  const typePath = typeMap[category] || '';
  const opPath = opMap[operation] || 'venta';
  const zonePath = zoneMap[zone] || 'capital-federal';

  let url = `https://inmuebles.mercadolibre.com.ar`;
  if (typePath) url += `/${typePath}`;
  url += `/${opPath}/${zonePath}/`;

  // Add filters
  const filters = [];
  if (priceMin || priceMax) {
    const cur = (currency || 'USD').toUpperCase();
    const min = priceMin || '0';
    const max = priceMax || '';
    if (max) filters.push(`_PriceRange_${min}${cur}-${max}${cur}`);
    else filters.push(`_PriceRange_${min}${cur}-0${cur}`);
  }
  if (rooms) filters.push(`_ROOMS_${rooms}`);
  if (beds) filters.push(`_BEDROOMS_${beds}`);
  if (baths) filters.push(`_FULL*BATHROOMS_${baths}`);
  if (parking) filters.push(`_PARKING*LOTS_${parking}`);

  if (q) url += `${encodeURIComponent(q)}_`;
  if (filters.length) url += filters.join('');
  if (sort && sortMap[sort]) url += sortMap[sort];

  // Pagination
  const pageOffset = parseInt(offset) || 0;
  if (pageOffset > 0) {
    const desde = pageOffset + 1;
    url += `_Desde_${desde}`;
  }

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'es-419,es;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
    'Cache-Control': 'no-cache',
  };

  try {
    console.log('Scraping ML URL:', url);
    const r = await fetch(url, { headers, redirect: 'follow' });

    if (!r.ok) {
      return res.status(r.status).json({ error: `ML returned ${r.status}`, url });
    }

    const html = await r.text();

    // Extract JSON-LD data
    const ldMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    let listings = [];
    let totalResults = 0;

    if (ldMatch) {
      try {
        const ld = JSON.parse(ldMatch[1]);
        const graph = ld['@graph'] || [];
        listings = graph.filter(item => item['@type'] === 'RealEstateListing' || item.offers).map(item => ({
          id: item.url ? item.url.match(/MLA-?(\d+)/)?.[1] || '' : '',
          title: item.name || '',
          price: item.offers?.price || 0,
          currency_id: item.offers?.priceCurrency || 'USD',
          permalink: item.url || '',
          thumbnail: item.image ? item.image.replace('http:', 'https:') : '',
          address: {},
          attributes: [],
        }));
      } catch (e) {
        console.log('JSON-LD parse error:', e.message);
      }
    }

    // Extract total count from HTML
    const totalMatch = html.match(/(\d[\d.]*)\s+resultados?/i) || html.match(/"total"\s*:\s*(\d+)/);
    if (totalMatch) {
      totalResults = parseInt(totalMatch[1].replace(/\./g, ''));
    }

    // Extract richer data from HTML - look for __PRELOADED_STATE__ or search results data
    const stateMatch = html.match(/window\.__PRELOADED_STATE__\s*=\s*({[\s\S]*?});\s*<\/script>/) ||
                       html.match(/"results"\s*:\s*(\[[\s\S]*?\])\s*[,}]/);

    // Try to extract location and attributes from card HTML
    const cardRegex = /class="[^"]*ui-search-layout__item[^"]*"[\s\S]*?<\/li>/g;
    const cards = html.match(cardRegex) || [];

    for (let i = 0; i < Math.min(cards.length, listings.length); i++) {
      const card = cards[i];

      // Location
      const locMatch = card.match(/ui-search-item__location[^>]*>([^<]+)/);
      if (locMatch) {
        const parts = locMatch[1].split(',').map(s => s.trim());
        listings[i].address = {
          city_name: parts[0] || '',
          state_name: parts[parts.length - 1] || '',
        };
      }

      // Attributes (rooms, bathrooms, area)
      const attrMatches = card.match(/(\d+)\s*ambs?\.?/i);
      const bathMatch = card.match(/(\d+)\s*ba[ñn]os?/i);
      const areaMatch = card.match(/([\d.,]+)\s*m[²2]\s*(cubiertos|totales|tot)?/i);
      const parkMatch = card.match(/(\d+)\s*cocheras?/i) || card.match(/(\d+)\s*estacionamiento/i);
      const bedMatch = card.match(/(\d+)\s*dormitorios?/i) || card.match(/(\d+)\s*dorms?\.?/i);

      const attrs = [];
      if (attrMatches) attrs.push({ id: 'ROOMS', value_name: attrMatches[1] });
      if (bedMatch) attrs.push({ id: 'BEDROOMS', value_name: bedMatch[1] });
      if (bathMatch) attrs.push({ id: 'FULL_BATHROOMS', value_name: bathMatch[1] });
      if (areaMatch) attrs.push({ id: 'TOTAL_AREA', value_name: areaMatch[1].replace(',', '.') + ' m²' });
      if (parkMatch) attrs.push({ id: 'PARKING_LOTS', value_name: parkMatch[1] });

      listings[i].attributes = attrs;
    }

    // Also try parsing poly-card components (newer ML layout)
    if (listings.length === 0) {
      // Fallback: parse from poly-card HTML directly
      const priceRegex = /andes-money-amount__fraction[^>]*>([\d.]+)</g;
      const titleRegex = /poly-component__title[^>]*>([^<]+)/g;
      const linkRegex = /href="(https:\/\/[^"]*MLA[^"]+)"/g;

      let match;
      const prices = [];
      while ((match = priceRegex.exec(html)) !== null) prices.push(match[1]);
      const titles = [];
      while ((match = titleRegex.exec(html)) !== null) titles.push(match[1]);
      const links = [];
      while ((match = linkRegex.exec(html)) !== null) {
        if (match[1].includes('mercadolibre.com.ar/MLA')) links.push(match[1]);
      }

      const uniqueLinks = [...new Set(links)];
      for (let i = 0; i < uniqueLinks.length; i++) {
        listings.push({
          id: uniqueLinks[i].match(/MLA-?(\d+)/)?.[1] || String(i),
          title: titles[i] || '',
          price: parseInt((prices[i] || '0').replace(/\./g, '')),
          currency_id: 'USD',
          permalink: uniqueLinks[i],
          thumbnail: '',
          address: {},
          attributes: [],
        });
      }
    }

    const response = {
      results: listings,
      paging: {
        total: totalResults || listings.length,
        offset: pageOffset,
        limit: 48,
      },
      source: 'scrape',
      scrape_url: url,
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
    return res.status(200).json(response);

  } catch (e) {
    console.error('Scrape error:', e);
    return res.status(502).json({ error: e.message, url });
  }
}
