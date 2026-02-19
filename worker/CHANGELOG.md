# Changelog

All notable changes to the Verifiable Randomness Service.

## [0.1.0-BETA] - 2026-02-18

### Initial Production Release

**Multichain Support:**

- Solana mainnet and devnet support
- Base (EVM) mainnet support with MetaMask integration
- Separate payment wallets per chain (Solana: 3Qudd5FG..., Base: 0x2d55...)
- USDC payments via x402 protocol on both chains

**RPC & Infrastructure:**

- Helius RPC integration (primary) for Solana
- Fallback to public RPCs if Helius unavailable
- Redis-based replay protection for payment verification

**Frontend UI:**

- Landing page with network selector (Solana/Base)
- Wallet connection (Phantom/Solflare for Solana, MetaMask for Base)
- Real-time transaction signing and payment flow
- Attestation verification display

**Security:**

- Rate limiting (100/min global, 20/min paid)
- Whitelist support for free API access
- API key authentication for partners
- x402 payment verification via PayAI facilitator
- Arweave commitment proofs for verification

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

**TEE Integration:**

- Intel TDX hardware-backed randomness generation
- Remote attestation via Phala dStack SDK
- Simulation mode for local development

**Monitoring:**

- Comprehensive logging
- Health check endpoint with detailed status
- Arweave commitment storage for audit trails
