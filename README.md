# Verifiable Randomness Service

This service provides the live Mystery Gift randomness API at `https://rng.mysterygift.fun`.

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
