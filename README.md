# Verifiable Randomness Service

TEE-powered verifiable randomness for the Mystery Gift platform.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    rng.mysterygift.fun                          │
│                  (Cloudflare Workers - Landing Page)            │
├─────────────────────────────────────────────────────────────────┤
│  Landing Page UI    │    API Proxy (/v1/*)                      │
│  - Wallet connect   │         │                                 │
│  - Payment (x402)   │         ▼                                 │
│  - Receipt modal    │  ┌─────────────────────────────────┐      │
│                     │  │  Phala Cloud TEE Worker         │      │
│                     │  │  (Intel TDX Trusted Enclave)    │      │
│                     │  │  - Random seed generation       │      │
│                     │  │  - Remote attestation           │      │
│                     │  │  - Payment verification         │      │
│                     │  └─────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────┘
```

## Components

| Component  | Description              | Deployment           |
| ---------- | ------------------------ | -------------------- |
| `worker/`  | TEE Randomness Worker    | Phala Cloud (Docker) |
| `landing/` | Landing Page & API Proxy | Cloudflare Workers   |

## Quick Start

### TEE Worker (Phala Cloud)

```bash
cd worker
npm install
npm run dev    # Local development (simulated TEE)
npm run build  # Build for production
```

Deploy to Phala Cloud using the Phala Dashboard or CLI.

### Landing Page (Cloudflare Workers)

```bash
cd landing
npm install
npm run dev    # Local development at http://localhost:8787
npm run deploy # Deploy to Cloudflare Workers
```

## Endpoints

| Endpoint             | Method | Description              |
| -------------------- | ------ | ------------------------ |
| `/v1/randomness`     | POST   | Generate random seed     |
| `/v1/random/number`  | POST   | Random number in range   |
| `/v1/random/dice`    | POST   | Roll dice (e.g., 2d6)    |
| `/v1/random/pick`    | POST   | Pick from list           |
| `/v1/random/shuffle` | POST   | Shuffle array            |
| `/v1/random/uuid`    | POST   | Generate UUID            |
| `/v1/attestation`    | GET    | Get TEE attestation      |
| `/v1/verify`         | POST   | Verify attestation quote |
| `/v1/health`         | GET    | Health check             |

## Payment

Uses the [x402 protocol](https://x402.org) for machine-to-machine payments:

- **$0.01 per request** via USDC or SOL on Solana mainnet

## Security

- Randomness generated inside Intel TDX Trusted Execution Environment
- Hardware-backed remote attestation proofs
- Operators cannot access or predict random values

## Links

- **Live**: https://rng.mysterygift.fun
- **Phala Node**: https://cloud.phala.network
- **Documentation**: https://docs.mysterygift.fun

## License

MIT
