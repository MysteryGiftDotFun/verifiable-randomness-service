# Changelog

All notable changes to the Verified Randomness Service.

## [0.0.1] - 2026-01-08

### Initial Release

**Security Features:**

- x402 payment protocol support ($0.01 per request)
- Replay attack prevention via LRU signature cache
- Rate limiting (100/min global, 20/min paid endpoints)
- Strict CORS policy for production
- Multi-RPC fallback (Helius → Alchemy → Public)

**TEE Integration:**

- Intel TDX hardware-backed randomness generation
- Remote attestation via Phala dStack SDK
- Simulation mode for local development

**API Endpoints:**

- `POST /v1/randomness` - 256-bit random seed
- `POST /v1/random/number` - Random integer in range
- `POST /v1/random/dice` - Roll dice (NdM notation)
- `POST /v1/random/pick` - Pick one item from array
- `POST /v1/random/shuffle` - Fisher-Yates shuffle
- `POST /v1/random/winners` - Pick multiple unique winners
- `POST /v1/random/uuid` - Generate UUIDv4
- `GET /v1/attestation` - Get TEE attestation info
- `GET /v1/health` - Health check
- `POST /v1/verify` - Verify attestation quote

**Monitoring:**

- GlitchTip/Sentry integration for error tracking
- Health check endpoint with detailed status
- Comprehensive logging

**Authentication:**

- Whitelist support (free access for allowed origins)
- API key support (partner access)
- x402 payment protocol (Solana mainnet)

**Deployment:**

- Docker support with non-root user
- Phala Cloud compatible
- Cloudflare Workers landing page
