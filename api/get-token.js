export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 'no-store');

  const SUPABASE_URL = 'https://ysynltkotzizayjtoujf.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlzeW5sdGtvdHppemF5anRvdWpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU2MzM1MjksImV4cCI6MjA4MTIwOTUyOX0.-rSFZIILSIwPWIRW-frMm27_wRsIOK79Txz5alE6QUE';

  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/ml_tokens?id=eq.default&select=access_token,expires_in,saved_at`,
      {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
        }
      }
    );
    const rows = await response.json();
    if (rows && rows.length > 0) {
      const token = rows[0];
      const elapsed = (Date.now() - token.saved_at) / 1000;
      const expired = elapsed > (token.expires_in || 21600);
      return res.status(200).json({
        access_token: token.access_token,
        expired: expired,
        elapsed_seconds: Math.round(elapsed)
      });
    }
    return res.status(404).json({ error: 'No token found' });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
