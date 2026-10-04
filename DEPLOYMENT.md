# Verifiable Randomness Deployment

## Canonical Runtime

- service repo: `services/verifiable-randomness-service`
- runtime path: `worker`
- production compose: `worker/phala-compose.prod.yaml`
- public endpoint: `https://rng.mysterygift.fun`

## Deploy

Production image builds and publishes must run on the Spectre build server. The
current production release is `0.1.8-BETA.10`; its source is
`worker/phala-compose.prod.yaml`. Resolve runtime secrets from Infisical project
`mystery-gift`, environment `prod`, path `/mystery-gift/randomness`, and apply
them through Phala's encrypted environment settings when deploying. Do not
commit or log resolved secret values.

## Required Environment

- `PAYMENT_WALLET`
- `HELIUS_RPC_URL`
- `BASE_RPC_URL`
- `REDIS_PASSWORD` (required by the Phala Compose Redis sidecar; set as an encrypted secret and use a URI-safe hex value)

Common production settings:

- `PAYMENT_WALLET_BASE`
- `X402_FACILITATOR_URL`
- `SUPPORTED_NETWORKS`
- `ARWEAVE_ENABLED`
- `PHALA_APP_ID`
- `PHALA_CLUSTER`

## Verify

```bash
curl -sS https://rng.mysterygift.fun/v1/health
```

In production, `/v1/health` returns 200 only when TDX and Redis-backed payment
replay protection are ready. A 503 means paid RNG requests are intentionally
unavailable until the missing dependency recovers.

The production Compose file runs Redis privately in the same CVM, with a
persistent ZFS-backed volume, AOF persistence, `noeviction`, a 128 MiB Redis
data limit, and a 256 MiB container limit. EVM x402 validity is capped at one
hour and Redis replay claims expire after that maximum window. Solana payment
transactions expire with their much shorter blockhash lifetime. At the configured request rate,
this bounds storage while keeping claims through the accepted proof window.
Monitor Redis memory and disk after deployment; when the cap is reached, Redis
rejects new claims and paid requests fail closed. Build and publish a new RNG
image containing source changes on Spectre before deploying a Compose update.
The `0.1.8-BETA.10` image and Redis sidecar are live; public health reports both
TEE and Redis readiness. The Redis volume exists, but persistence across a
restart/redeploy still needs an explicit recovery test.
