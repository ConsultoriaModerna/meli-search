const SUPABASE_URL = 'https://ysynltkotzizayjtoujf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlzeW5sdGtvdHppemF5anRvdWpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU2MzM1MjksImV4cCI6MjA4MTIwOTUyOX0.-rSFZIILSIwPWIRW-frMm27_wRsIOK79Txz5alE6QUE';

async function getToken() {
  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/ml_tokens?id=eq.default&select=access_token,saved_at,expires_in`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
      }
    );
    if (resp.ok) {
      const data = await resp.json();
      if (data.length > 0) {
        const t = data[0];
        const elapsed = (Date.now() - t.saved_at) / 1000;
        if (elapsed < t.expires_in - 300) {
          return t.access_token;
        }
      }
    }
  } catch (e) {
    console.log('Token fetch error:', e.message);
  }
  return null;
}

export default {
  async fetch(request) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);
    const mlPath = url.searchParams.get('path') || 'sites/MLA/search';
    const params = new URLSearchParams(url.searchParams);
    params.delete('path');

    const mlUrl = 'https://api.mercadolibre.com/' + mlPath + '?' + params.toString();

    // Get token from Supabase
    const token = await getToken();

    try {
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'es-AR,es;q=0.9',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(mlUrl, { headers });
      const data = await res.text();

      return new Response(data, {
        status: res.status,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'X-ML-Token': token ? 'yes' : 'no',
        },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  },
};
