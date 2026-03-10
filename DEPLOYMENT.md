# Verifiable Randomness Deployment

## Canonical Runtime

- service repo: `services/verifiable-randomness-service`
- runtime path: `worker`
- production compose: `worker/phala-compose.prod.yaml`
- public endpoint: `https://rng.mysterygift.fun`

## Deploy

```bash
cd /Users/area/repos/mystery-gift/services/verifiable-randomness-service/worker
phala deploy --compose phala-compose.prod.yaml -e .env
```

## Required Environment

- `PAYMENT_WALLET`
- `HELIUS_RPC_URL`
- `BASE_RPC_URL`

Common production settings:

- `PAYMENT_WALLET_BASE`
- `X402_FACILITATOR_URL`
- `SUPPORTED_NETWORKS`
- `ARWEAVE_ENABLED`
- `PHALA_APP_ID`
- `PHALA_CLUSTER`
- `REDIS_URL`

## Verify

```bash
curl -sS https://rng.mysterygift.fun/v1/health
```
