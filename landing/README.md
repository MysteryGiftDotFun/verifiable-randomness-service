# TEE Landing Page (Cloudflare Workers)

This is the landing page for the Mystery Gift TEE Randomness Service, designed to be hosted on Cloudflare Workers at `rng.mysterygift.fun`.

## Architecture

- **Landing Page**: Served directly by Cloudflare Workers (this project)
- **API Backend**: Proxied to the actual TEE Worker running on Phala Cloud

```
User → rng.mysterygift.fun (CF Workers)
         ├── / (Landing Page HTML)
         ├── /assets/* (Static assets)
         ├── /terms, /privacy, /changelog (Static pages)
         └── /v1/* (Proxied to Phala TEE Worker)
```

## Development

```bash
# Install dependencies
npm install

# Run locally
npm run dev
# Opens at http://localhost:8787

# Deploy to Cloudflare
npm run deploy
```

## Configuration

The `wrangler.jsonc` configuration includes:

- **TEE_API_URL**: The URL of the actual TEE Worker on Phala Cloud
- **routes**: Binds to `rng.mysterygift.fun/*`
- **assets**: Serves static files from `./public`

## Deployment

1. Make sure you're logged into Cloudflare: `npx wrangler login`
2. Deploy: `npm run deploy`

## Files

- `src/index.ts` - Main worker entry point, handles routing and API proxying
- `src/landing.ts` - Renders the full landing page HTML/CSS/JS
- `src/html.ts` - Helper functions for static pages (Terms, Privacy)
- `public/assets/miss.png` - Character image for the landing page

## Notes

- The landing page JavaScript makes API calls to `/v1/*` endpoints
- These are proxied to the TEE Worker on Phala Cloud
- Static assets are served by Cloudflare's edge network
- The TEE Worker itself remains on Phala for hardware attestation
