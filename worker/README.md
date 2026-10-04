# TEE Randomness Worker

This is the Phala runtime for the live Mystery Gift randomness service.

## Public API

- `POST /v1/randomness`
- `POST /v1/random/number`
- `POST /v1/random/dice`
- `POST /v1/random/pick`
- `POST /v1/random/shuffle`
- `POST /v1/random/winners`
- `POST /v1/random/uuid`
- `GET /v1/attestation`
- `POST /v1/verify`
- `GET /v1/health`

## Runtime Model

- x402 pay-per-request at `$0.01`
- Solana and Base supported
- production CORS limited to `*.mysterygift.fun`
- optional Arweave commitment publishing

## Deploy

Build and publish production images on the Spectre build server. Runtime secrets
come from Infisical project `mystery-gift`, environment `prod`, path
`/mystery-gift/randomness`, and must be applied through Phala's encrypted
environment settings. See the repository's [deployment guide](../../DEPLOYMENT.md).

## Environment

See `.env.example`.

## Verification

```bash
curl -sS https://rng.mysterygift.fun/v1/health
```
