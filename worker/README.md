# TEE Randomness Worker v2.0

A secure randomness generator designed to run inside a **Phala Network TEE (Trusted Execution Environment)**. Provides provably fair random numbers with hardware attestation.

## Deployment (v15 - Current)

**For deploying v15 with custom domain SSL, see [DNS-SETUP.md](./DNS-SETUP.md)**

### Quick Deploy to Phala Cloud

```bash
# 1. SSH to Hetzner build server
ssh hetzner-phantasy-001

# 2. Build and push image
cd ~/mystery-gift-deploy/services/verifiable-randomness-service/worker
sudo docker build -t phantasybot/verifiable-randomness-service:v0.1.0-BETA-v15 .
sudo docker push phantasybot/verifiable-randomness-service:v0.1.0-BETA-v15

# 3. Deploy to existing CVM
cd ~/mystery-gift-deploy

# Deploy prod
npx phala deploy --cvm-id de014c8e6c862d1d0799ec035e85f93912769f12 \
  -c services/verifiable-randomness-service/worker/phala-compose.prod-v14.yaml \
  -e services/verifiable-randomness-service/worker/.env

# Deploy dev
npx phala deploy --cvm-id 68bfb1758fa20d75cac0af456e9868e4f1cc9e7c \
  -c services/verifiable-randomness-service/worker/phala-compose.dev-v14.yaml \
  -e services/verifiable-randomness-service/worker/.env
```

### Required Environment Variables

```bash
# Payment wallets
PAYMENT_WALLET=3Qudd5FG8foyFnbKxwfkDktnuushG7CDHBMSNk9owAjx
PAYMENT_WALLET_BASE=0x2d55488AD8dd2671c2F8D08FAad75908afa461c3

# RPC URLs
HELIUS_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_HELIUS_KEY
BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_ALCHEMY_KEY

# Access control (API key for partners - everyone else pays $0.01 via x402)
API_KEYS=6d44c71a16450ce80e3bf8dc8a0904e59eaaa3524c8eb31a9f500e5743560b8b

# x402 payment
X402_FACILITATOR_URL=https://facilitator.payai.network

# Custom domain (dstack-ingress handles SSL)
CLOUDFLARE_API_TOKEN=your-cloudflare-dns-token
CERTBOT_EMAIL=hello@mysterygift.fun
```

**Important:** v15 removed the whitelist - everyone must pay $0.01 USDC per request via x402 protocol. API key holders get free access.

## Quick Start

### Deploy to Phala Cloud

```bash
cd tee-worker

# Interactive deployment
./scripts/quick-deploy.sh
```

This will:

1. Log you into Docker Hub (if needed)
2. Log you into Phala Cloud (if needed)
3. Build and push the Docker image
4. Deploy to Phala Cloud CVM

### Local Development

```bash
# Install dependencies
npm install

# Run dev server (simulation mode)
npm run dev

# Open http://localhost:3000 for the landing page
```

## Features

- **Hardware-backed randomness**: Uses Intel SGX/TDX secure enclaves
- **Remote attestation**: Cryptographic proof that code ran unchanged in TEE
- **x402 payment support**: Pay-per-request API ($0.01 per attestation)
- **Whitelist access**: Free access for your own applications
- **API key authentication**: Free access for authorized partners

## Hybrid Payment Architecture

This service uses a hybrid approach combining x402 protocol with minimal RPC usage:

| Component                | Purpose                                       | RPC Used                          |
| ------------------------ | --------------------------------------------- | --------------------------------- |
| **Payment Verification** | Verify user paid via PayAI facilitator        | **None** (handled by facilitator) |
| **Transaction Building** | Build unsigned tx (get nonce, blockhash, gas) | Helius (Solana), Alchemy (Base)   |
| **Result Delivery**      | Return randomness + attestation               | **None**                          |

### Why RPC is needed for the Human UI

The browser-based human UI needs RPC endpoints to **build transactions** before the user signs them:

- **Solana**: Get recent blockhash, verify USDC balance
- **Base**: Get nonce, estimate gas, verify USDC balance

However, **payment verification** (did they actually pay?) is handled entirely by the PayAI facilitator - we don't need our own RPC for that.

### Programmatic Access (No RPC Needed)

For server-to-server API calls, you can use x402 directly:

```bash
# Get payment requirements
curl -X POST https://vrf.mysterygift.fun/v1/random/number \
  -H "Content-Type: application/json" \
  -d '{"min": 1, "max": 100}'

# Returns 402 with payment instructions - complete payment, then retry with X-Payment header
```

## Why TEE over VRF?

| Feature          | TEE Attestation   | On-chain VRF       |
| ---------------- | ----------------- | ------------------ |
| **Cost**         | $0.01/request     | $0.10-0.30/request |
| **Speed**        | Instant           | 1-2 blocks         |
| **Verification** | Attestation proof | On-chain math      |
| **Trust model**  | Hardware enclave  | Cryptographic      |

TEE is **90%+ cheaper** than VRF while providing similar trust guarantees through hardware-backed attestation.

## Security for Financial Applications

### Why `crypto.randomBytes(32)` is Secure for Financial Use

This service uses Node.js `crypto.randomBytes(32)` running inside an Intel TDX enclave. Here's why it's suitable for financial applications:

| Aspect             | `crypto.randomBytes(32)`                              | `Math.random()`                             |
| ------------------ | ----------------------------------------------------- | ------------------------------------------- |
| **Source**         | OS CSPRNG (`/dev/urandom`) seeded by kernel entropy   | Deterministic algorithm (LCG)               |
| **Predictability** | Cryptographically secure, impossible to predict       | Predictable if seed is known                |
| **TEE Protection** | Bound to hardware attestation                         | Not applicable                              |
| **Financial Use**  | ✅ **Approved for NFT drops, gaming, gambling, DeFi** | ❌ **Never use for financial applications** |

The randomness comes from the operating system's kernel entropy pool, which collects randomness from hardware sources (keyboard timing, disk I/O, CPU timing variations, etc.). Inside Intel TDX, this is further protected by hardware isolation - the enclave cannot be accessed even by us (the operators).

### Comparison with On-Chain Solutions

| Feature           | Our TEE + Arweave                  | Chainlink VRF          | Switchboard           |
| ----------------- | ---------------------------------- | ---------------------- | --------------------- |
| **Security**      | Intel TDX (hardware enclave)       | On-chain cryptographic | Oracle network        |
| **Verification**  | Remote attestation + Arweave proof | On-chain verification  | On-chain verification |
| **Cost**          | $0.01/request                      | $2-50/request          | $0.10-2/request       |
| **Latency**       | ~500ms                             | ~30s                   | ~15s                  |
| **Financial Use** | ✅ Yes                             | ✅ Yes                 | ✅ Yes                |

All three are approved for financial applications. Our TEE approach is cheaper and faster, while on-chain solutions offer different trust models.

## API Endpoints

### `GET /v1/health`

Health check (no auth required).

```json
{
  "status": "ok",
  "type": "sgx-tee",
  "version": "2.0.0",
  "x402_enabled": true,
  "price_per_request": "$0.01"
}
```

### `GET /v1/pricing`

Returns pricing and payment information for x402 clients.

### `POST /v1/randomness`

Generate attested random seed. **Requires payment or whitelist/API key**.

**Request:**

```json
{
  "request_hash": "sha256-of-your-request-data",
  "metadata": { "raffle_id": "abc123" }
}
```

**Response:**

```json
{
  "random_seed": "64-character-hex-string",
  "attestation": "base64-encoded-sgx-quote",
  "timestamp": 1704067200000,
  "mrenclave": "code-hash-for-verification",
  "tee_type": "sgx"
}
```

### `GET /v1/stats`

Usage statistics (requires API key).

## Authentication Methods

### 1. Whitelist (Free)

Add your domain to `WHITELIST` env var. Requests from whitelisted origins are free.

```bash
WHITELIST=localhost,mysterygift.io,your-app.com
```

### 2. API Key (Free)

For server-to-server requests, use API keys.

```bash
# In your request:
curl -H "X-API-Key: your-secret-key" https://tee.example.com/v1/randomness
```

### 3. x402 Payment ($0.01/request)

For public access to **generate new randomness** (e.g., run your own raffle), pay per request using the x402 protocol.

**Note:** Verification is always free. You do not need to pay to verify an attestation.

**Step 1:** Call endpoint without payment to get payment details:

```bash
curl -X POST https://tee.example.com/v1/randomness
# Returns 402 with payment instructions
```

**Step 2:** Make payment to the specified wallet.

**Step 3:** Include payment proof in header:

```bash
curl -X POST https://tee.example.com/v1/randomness \
  -H "X-Payment: x402 <base64-encoded-proof>" \
  -H "Content-Type: application/json" \
  -d '{"request_hash": "abc123"}'
```

## Deployment

### Prerequisites

- [Phala Cloud](https://cloud.phala.network) account
- Docker installed locally

### Build & Push

```bash
cd tee-worker

# Build image
docker build -t yourusername/tee-randomness:latest .

# Push to registry
docker push yourusername/tee-randomness:latest
```

### Deploy to Phala Cloud

1. Log in to [Phala Cloud Dashboard](https://cloud.phala.network)
2. Create a new **dStack** application
3. Configure:
   - **Image**: `yourusername/tee-randomness:latest`
   - **Port**: `3000`
   - **Environment Variables**:
     - `PAYMENT_WALLET`: Your Solana wallet for receiving payments
     - `WHITELIST`: Comma-separated list of allowed origins
     - `API_KEYS`: Comma-separated list of API keys
4. Deploy

### Local Development

```bash
# Install dependencies
npm install

# Copy env file
cp .env.example .env

# Edit .env with your settings
nano .env

# Run dev server
npm run dev
```

The server runs in **Simulation Mode** locally (no SGX hardware). Mock attestations are generated with a warning.

## Integration Example

```typescript
import crypto from "crypto";

async function getVerifiedRandomness(raffleId: string): Promise<string> {
  const requestHash = crypto
    .createHash("sha256")
    .update(raffleId)
    .update(Date.now().toString())
    .digest("hex");

  const response = await fetch("https://tee.example.com/v1/randomness", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": process.env.TEE_API_KEY!, // Or use x402 payment
    },
    body: JSON.stringify({
      request_hash: requestHash,
      metadata: { raffle_id: raffleId },
    }),
  });

  const data = await response.json();

  // Verify attestation matches expected MRENCLAVE
  // (In production, verify SGX quote cryptographically)

  return data.random_seed;
}
```

## Security Considerations

1. **MRENCLAVE Verification**: Always verify the returned `mrenclave` matches the expected code hash
2. **Attestation Verification**: Use Intel's attestation verification service to validate SGX quotes
3. **Request Hash**: Include unique data in `request_hash` to prevent replay attacks
4. **Payment Verification**: The server verifies x402 payments via the PayAI facilitator before providing randomness

## Environment Variables

| Variable               | Description                     | Required |
| ---------------------- | ------------------------------- | -------- |
| `PORT`                 | Server port (default: 3000)     | No       |
| `PAYMENT_WALLET`       | Solana wallet for x402 payments | Yes      |
| `WHITELIST`            | Comma-separated allowed origins | No       |
| `API_KEYS`             | Comma-separated API keys        | No       |
| `MRENCLAVE`            | Set by TEE environment          | Auto     |
| `X402_FACILITATOR_URL` | PayAI facilitator URL           | Yes      |
| `SUPPORTED_NETWORKS`   | Payment networks (solana,base)  | No       |

## Verification (Free)

Verifying randomness is a read-only operation and is always free.

**API Endpoint:** `POST /v1/verify`

**Usage:**

1. Get the attestation from the raffle result or randomness response.
2. Send it to the verification endpoint (or verify locally using Intel SGX SDK).

```bash
curl -X POST https://tee.example.com/v1/verify \
  -H "Content-Type: application/json" \
  -d '{"attestation": "base64-string..."}'
```

## Scaling Strategy

For high-volume public usage (>20 requests/second), use **Horizontal Scaling** behind a load balancer.

**Bottleneck**: Intel TDX Attestation generation (`dstack.getQuote()`) is a hardware-bound operation (50-200ms per quote, serialized per CPU package).

**Recommended Architecture**:

1. Deploy **N identical CVMs** on Phala Cloud.
2. Use a **Round-Robin Load Balancer** (Cloudflare, Nginx, or AWS ALB) to distribute traffic.
3. Stateless design allows any CVM to handle any request.

**Capacity Planning**:

- 1 CVM: ~15-20 requests/second (sustained)
- 5 CVMs: ~75-100 requests/second
- Cost: Linear scaling ($0.01/req covers infrastructure costs easily)

## Security Architecture

1.  **x402 Payment**:

    - Client creates payment intent via `/v1/payment/create`.
    - Client completes payment through the PayAI facilitator (Solana or Base).
    - Client includes `paymentId` in `X-Payment` header.
    - TEE worker verifies payment status via facilitator API.
    - Replay protection via LRU payment ID cache (10,000 entries, 1h TTL).

2.  **TEE Attestation**:

    - Every response includes an Intel TDX Quote.
    - Quote binds the `random_seed` to the hardware enclave.
    - Verifiable via Phala Cloud API or Intel SGX/TDX verification services.

3.  **Audit Trail**:
    - All randomness generation is logged.
    - `request_hash` links the randomness to a specific user action (raffle ID, purchase ID).
