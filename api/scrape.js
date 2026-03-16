export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { category, operation, zone, priceMin, priceMax, currency, rooms, beds, baths, area_min, area_max, parking, sort, q, offset, debug } = req.query;

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

  let url = 'https://inmuebles.mercadolibre.com.ar';
  if (typePath) url += '/' + typePath;
  url += '/' + opPath + '/' + zonePath + '/';

  const filters = [];
  if (priceMin || priceMax) {
    const cur = (currency || 'USD').toUpperCase();
    const min = priceMin || '0';
    const max = priceMax || '';
    if (max) filters.push('_PriceRange_' + min + cur + '-' + max + cur);
    else filters.push('_PriceRange_' + min + cur + '-0' + cur);
  }
  if (rooms) filters.push('_ROOMS_' + rooms);
  if (beds) filters.push('_BEDROOMS_' + beds);
  if (baths) filters.push('_FULL*BATHROOMS_' + baths);
  if (parking) filters.push('_PARKING*LOTS_' + parking);

  if (q) url += encodeURIComponent(q) + '_';
  if (filters.length) url += filters.join('');
  if (sort && sortMap[sort]) url += sortMap[sort];

  const pageOffset = parseInt(offset) || 0;
  if (pageOffset > 0) {
    url += '_Desde_' + (pageOffset + 1);
  }

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'es-419,es;q=0.9,en;q=0.8',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
    'Cache-Control': 'no-cache',
  };

  try {
    console.log('[SCRAPE] URL:', url);
    const r = await fetch(url, { headers, redirect: 'follow' });
    console.log('[SCRAPE] Status:', r.status, 'Final URL:', r.url);

    if (!r.ok) {
      return res.status(r.status).json({ error: 'ML returned ' + r.status, url, final_url: r.url });
    }

    const html = await r.text();
    console.log('[SCRAPE] HTML length:', html.length);

    // Debug mode: return HTML analysis
    if (debug === '1') {
      const titleMatch = html.match(/<title>([^<]*)<\/title>/);
      const hasLdJson = html.includes('application/ld+json');
      const hasPolyCard = html.includes('poly-card');
      const hasSearchItem = html.includes('ui-search-layout__item');
      const hasCaptcha = html.includes('captcha') || html.includes('challenge') || html.includes('g-recaptcha');
      const hasBlocked = html.includes('Access Denied') || html.includes('blocked');
      const hasPreloaded = html.includes('__PRELOADED_STATE__');
      const totalMatch = html.match(/(\d[\d.]*)\s+resultados?/i);
      const priceCount = (html.match(/andes-money-amount/g) || []).length;
      const mlaLinks = (html.match(/MLA-?\d+/g) || []).length;
      const polyTitles = (html.match(/poly-component__title/g) || []).length;
      const h1Match = html.match(/<h1[^>]*>([^<]*)<\/h1>/);

      return res.status(200).json({
        debug: true,
        url,
        final_url: r.url,
        status: r.status,
        html_length: html.length,
        title: titleMatch ? titleMatch[1].trim() : null,
        h1: h1Match ? h1Match[1].trim() : null,
        has_ld_json: hasLdJson,
        has_poly_card: hasPolyCard,
        has_search_item: hasSearchItem,
        has_preloaded_state: hasPreloaded,
        has_captcha: hasCaptcha,
        has_blocked: hasBlocked,
        total_text: totalMatch ? totalMatch[0] : null,
        price_elements: priceCount,
        mla_links: mlaLinks,
        poly_titles: polyTitles,
        region: process.env.VERCEL_REGION || 'unknown',
        html_start: html.substring(0, 1500),
        html_middle: html.substring(Math.floor(html.length/2), Math.floor(html.length/2) + 1500),
      });
    }

    let listings = [];
    let totalResults = 0;

    // Strategy 1: JSON-LD data
    const ldMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    if (ldMatch) {
      try {
        const ld = JSON.parse(ldMatch[1]);
        const graph = ld['@graph'] || (Array.isArray(ld) ? ld : [ld]);
        listings = graph.filter(item => item['@type'] === 'RealEstateListing' || item['@type'] === 'Product' || (item.offers && item.name)).map(item => ({
          id: item.url ? (item.url.match(/MLA-?(\d+)/) || [])[1] || '' : '',
          title: item.name || '',
          price: item.offers?.price || item.offers?.lowPrice || 0,
          currency_id: item.offers?.priceCurrency || 'USD',
          permalink: item.url || '',
          thumbnail: item.image ? (typeof item.image === 'string' ? item.image : item.image.url || item.image[0] || '').replace('http:', 'https:') : '',
          address: {},
          attributes: [],
          _source: 'jsonld',
        }));
        console.log('[SCRAPE] JSON-LD found', listings.length, 'items');
      } catch (e) {
        console.log('[SCRAPE] JSON-LD parse error:', e.message);
      }
    }

    // Strategy 2: __PRELOADED_STATE__ (React SSR data)
    if (listings.length === 0) {
      const stateMatch = html.match(/window\.__PRELOADED_STATE__\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
      if (stateMatch) {
        try {
          const state = JSON.parse(stateMatch[1]);
          const results = state?.initialState?.results || state?.results || [];
          if (Array.isArray(results)) {
            listings = results.map(r => ({
              id: r.id || '',
              title: r.title || '',
              price: r.price?.amount || r.price || 0,
              currency_id: r.price?.currency_id || r.currency_id || 'USD',
              permalink: r.permalink || r.link || '',
              thumbnail: (r.thumbnail || r.pictures?.[0]?.url || '').replace('http:', 'https:'),
              address: r.address || r.location || {},
              attributes: r.attributes || [],
              _source: 'preloaded_state',
            }));
            console.log('[SCRAPE] Preloaded state found', listings.length, 'items');
          }
        } catch(e) {
          console.log('[SCRAPE] Preloaded state parse error:', e.message);
        }
      }
    }

    // Strategy 3: Parse individual item data from script tags
    if (listings.length === 0) {
      const dataScripts = html.match(/<script[^>]*>[\s\S]*?"id"\s*:\s*"MLA[\s\S]*?<\/script>/g) || [];
      for (const script of dataScripts.slice(0, 3)) {
        try {
          const jsonMatch = script.match(/(\{[\s\S]*"id"\s*:\s*"MLA[\s\S]*?\})\s*[,;)<\/]/);
          if (jsonMatch) {
            const obj = JSON.parse(jsonMatch[1]);
            if (obj.id && obj.title) {
              listings.push({
                id: obj.id,
                title: obj.title,
                price: obj.price || 0,
                currency_id: obj.currency_id || 'USD',
                permalink: obj.permalink || '',
                thumbnail: (obj.thumbnail || '').replace('http:', 'https:'),
                address: obj.address || {},
                attributes: obj.attributes || [],
                _source: 'script_data',
              });
            }
          }
        } catch(e) { /* skip */ }
      }
      if (listings.length > 0) console.log('[SCRAPE] Script data found', listings.length, 'items');
    }

    // Strategy 4: HTML card parsing (poly-card / ui-search)
    if (listings.length === 0) {
      // Try poly-card links with titles and prices
      const linkRegex = /href="(https:\/\/[^"]*MLA[^"]+)"/g;
      const titleRegex = /(?:poly-component__title|ui-search-item__title)[^>]*>([^<]+)/g;
      const priceRegex = /andes-money-amount__fraction[^>]*>([\d.]+)/g;
      const locRegex = /(?:poly-component__location|ui-search-item__location)[^>]*>([^<]+)/g;

      const links = [];
      let m;
      while ((m = linkRegex.exec(html)) !== null) {
        if (m[1].includes('mercadolibre.com.ar/MLA') || m[1].includes('casa') || m[1].includes('departamento') || m[1].includes('inmueble')) {
          links.push(m[1]);
        }
      }
      const uniqueLinks = [...new Set(links)];

      const titles = [];
      while ((m = titleRegex.exec(html)) !== null) titles.push(m[1].trim());

      const prices = [];
      while ((m = priceRegex.exec(html)) !== null) prices.push(parseInt(m[1].replace(/\./g, '')));

      const locations = [];
      while ((m = locRegex.exec(html)) !== null) locations.push(m[1].trim());

      for (let i = 0; i < uniqueLinks.length; i++) {
        const idMatch = uniqueLinks[i].match(/MLA-?(\d+)/);
        listings.push({
          id: idMatch ? idMatch[1] : String(i),
          title: titles[i] || 'Inmueble',
          price: prices[i] || 0,
          currency_id: 'USD',
          permalink: uniqueLinks[i],
          thumbnail: '',
          address: {
            city_name: locations[i] ? locations[i].split(',')[0].trim() : '',
            state_name: locations[i] && locations[i].includes(',') ? locations[i].split(',').pop().trim() : '',
          },
          attributes: [],
          _source: 'html_parse',
        });
      }
      if (listings.length > 0) console.log('[SCRAPE] HTML parse found', listings.length, 'items');
    }

    // Extract total from various patterns
    const totalMatch = html.match(/(\d[\d.]*)\s+resultados?/i) || html.match(/"total"\s*:\s*(\d+)/) || html.match(/"totalItems"\s*:\s*(\d+)/);
    if (totalMatch) {
      totalResults = parseInt(totalMatch[1].replace(/\./g, ''));
    }

    // Enrich cards with attributes from HTML context
    if (listings.length > 0 && listings[0]._source === 'html_parse') {
      const cardRegex = /(?:poly-card|ui-search-layout__item)[^>]*>[\s\S]*?(?:<\/(?:li|div)>)/g;
      const cards = html.match(cardRegex) || [];
      for (let i = 0; i < Math.min(cards.length, listings.length); i++) {
        const card = cards[i];
        const attrs = [];
        const attrMatch = card.match(/(\d+)\s*ambs?\.?/i);
        const bedMatch = card.match(/(\d+)\s*dormitorios?/i) || card.match(/(\d+)\s*dorms?\.?/i);
        const bathMatch = card.match(/(\d+)\s*ba[ñn]os?/i);
        const areaMatch = card.match(/([\d.,]+)\s*m[²2]/i);
        const parkMatch = card.match(/(\d+)\s*cocheras?/i);
        if (attrMatch) attrs.push({ id: 'ROOMS', value_name: attrMatch[1] });
        if (bedMatch) attrs.push({ id: 'BEDROOMS', value_name: bedMatch[1] });
        if (bathMatch) attrs.push({ id: 'FULL_BATHROOMS', value_name: bathMatch[1] });
        if (areaMatch) attrs.push({ id: 'TOTAL_AREA', value_name: areaMatch[1].replace(',', '.') + ' m2' });
        if (parkMatch) attrs.push({ id: 'PARKING_LOTS', value_name: parkMatch[1] });
        if (attrs.length) listings[i].attributes = attrs;
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
      strategies_tried: listings.length > 0 ? listings[0]._source : 'none',
      region: process.env.VERCEL_REGION || 'unknown',
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
    return res.status(200).json(response);

  } catch (e) {
    console.error('[SCRAPE] Error:', e);
    return res.status(502).json({ error: e.message, url });
  }
}
