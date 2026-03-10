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

```bash
cd /Users/area/repos/mystery-gift/services/verifiable-randomness-service/worker
phala deploy --compose phala-compose.prod.yaml -e .env
```

## Environment

See `.env.example`.

## Verification

```bash
curl -sS https://rng.mysterygift.fun/v1/health
```
