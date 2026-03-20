# meli-search (ARCHIVED)

> ⚠️ **Este repo está archivado.** El proyecto activo es [caba-market-study](https://github.com/ConsultoriaModerna/caba-market-study).

## Qué era
Scraper HTML de MercadoLibre Inmuebles, desplegado en Vercel. Tenía 4 estrategias de parsing (JSON-LD, `__PRELOADED_STATE__`, script tags, HTML regex).

## Por qué se archivó
- MercadoLibre empezó a bloquear IPs de cloud providers (Vercel, AWS, etc.) en marzo 2026
- El scraping ahora se hace vía Chrome con IP residencial desde [caba-market-study](https://github.com/ConsultoriaModerna/caba-market-study)
- El dashboard de meli-search fue reemplazado por el de caba-market-study

## Código útil
- `api/scrape.js` — Referencia de parsing HTML de MercadoLibre (4 estrategias)
