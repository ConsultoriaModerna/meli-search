module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json({
    status: 'ok',
    region: process.env.VERCEL_REGION || 'unknown',
    timestamp: new Date().toISOString(),
  });
};
