# Verifiable Randomness Service

This service provides the live Mystery Gift randomness product at `https://rng.mysterygift.fun`.

**Dual mode on the landing page:**

- **HTTP API / x402** — TEE seeds and helpers (`POST /v1/*`) for Miss, raffles, agents  
- **On-chain Flash VRF** — status + request UI for Phala Flash coordinators used by pack escrows (set `FLASH_VRF_COORDINATOR_*` env after deploy)

## Current Scope

- TEE-backed randomness on Phala
- x402 payment flow at `$0.01` per request
- Solana and Base payment support
- optional Arweave commitment publishing

The older whitelist / partner API-key flow is no longer the canonical model.

## Deploy

Use the worker compose files:

- `worker/phala-compose.prod.yaml`
- optional `worker/phala-compose.dev.yaml`

See [worker/README.md](worker/README.md) for the current runtime contract.
