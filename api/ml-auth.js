module.exports = async (req, res) => {
  const CLIENT_ID = '5245450773314516';
  const REDIRECT_URI = 'https://meli-search-consultoriamodernas-projects.vercel.app/api/ml-callback';
  const authUrl = `https://auth.mercadolibre.com.ar/authorization?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
  res.writeHead(302, { Location: authUrl });
  res.end();
};
