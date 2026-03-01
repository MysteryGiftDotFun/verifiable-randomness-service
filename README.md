# Verifiable Randomness (TEE) Service

TEE-powered verifiable randomness for the [Mystery Gift](https://mysterygift.fun) platform.

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

---

## Security Features

### 🔐 Payment Protection

- **x402 protocol** with facilitator-based verification (chain-agnostic)
- **Replay attack prevention** via LRU payment ID cache (10,000 entries, 1-hour TTL)
- **Multichain support**: Solana and Base via PayAI facilitator
- **Zero RPC dependencies**: Facilitator handles all on-chain verification

### 🛡️ Rate Limiting

- **Global rate limit**: 100 requests/minute per IP
- **Paid endpoint limit**: 20 requests/minute per payment ID
- **Prevents**: DOS attacks, API abuse, resource exhaustion

### 🌐 CORS Policy

**Allowed origins** (production only):

- `https://mysterygift.fun`
- `https://vrf.mysterygift.fun`
- `*.mysterygift.fun` (all subdomains)

**Development**: All origins allowed (`NODE_ENV=development`)

### 🔒 TEE Security

- **Intel TDX** hardware isolation
- **Remote attestation** for verification
- **Operators cannot** access or predict random values
- **Hardware RNG** backed by CPU entropy

---

## API Endpoints

All endpoints require authentication via one of three methods:

### Authentication Methods

| Method           | Priority | Description                                      |
| ---------------- | -------- | ------------------------------------------------ |
| **Whitelist**    | 1        | Free access for Mystery Gift apps (by origin/IP) |
| **API Key**      | 2        | Free access for partners (`X-API-Key` header)    |
| **x402 Payment** | 3        | $0.01 per request (`X-Payment` header)           |

### Endpoints

| Endpoint             | Method | Auth     | Description                  |
| -------------------- | ------ | -------- | ---------------------------- |
| `/v1/randomness`     | POST   | Required | Generate 256-bit random seed |
| `/v1/random/number`  | POST   | Required | Random integer in range      |
| `/v1/random/dice`    | POST   | Required | Roll dice (e.g., "2d6")      |
| `/v1/random/pick`    | POST   | Required | Pick one item from array     |
| `/v1/random/shuffle` | POST   | Required | Shuffle array (Fisher-Yates) |
| `/v1/random/winners` | POST   | Required | Pick multiple unique winners |
| `/v1/random/uuid`    | POST   | Required | Generate UUIDv4              |
| `/v1/attestation`    | GET    | No       | Get TEE attestation info     |
| `/v1/verify`         | POST   | No       | Verify attestation quote     |
| `/v1/health`         | GET    | No       | Health check                 |
| `/v1/stats`          | GET    | API Key  | Usage statistics             |

### Rate Limits

```
Global (all endpoints):  100 requests/minute per IP
Paid endpoints:          20 requests/minute per payment signature
```

**Rate limit headers**:

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1704729600
```

---

## Quick Start

### TEE Worker (Phala Cloud)

```bash
cd worker
npm install
npm run dev    # Local development (simulated TEE)
npm run build  # Build for production
```

**Environment variables** (see `worker/.env.example`):

```bash
NODE_ENV=production
PAYMENT_WALLET=<your-solana-address>
X402_FACILITATOR_URL=https://facilitator.payai.network
SUPPORTED_NETWORKS=solana
WHITELIST=mysterygift.fun,localhost
API_KEYS=secret-key-1,secret-key-2
```

Deploy to Phala Cloud using the Phala Dashboard or `phala-compose.yaml`.

### Landing Page (Cloudflare Workers)

```bash
cd landing
npm install
npm run dev    # Local development at http://localhost:8787
npm run deploy # Deploy to Cloudflare Workers
```

**Wrangler configuration** (`landing/wrangler.jsonc`):

```json
{
  "name": "tee-landing-page",
  "main": "src/index.ts",
  "compatibility_date": "2024-01-01",
  "vars": {
    "TEE_API_URL": "https://<app-id>-3000.dstack-pha-prod5.phala.network"
  }
}
```

---

## Payment (x402 Protocol)

### Overview

The service uses **x402** with facilitator-based verification. Payments are chain-agnostic — the PayAI facilitator handles all on-chain verification.

**Price**: $0.01 USD per request
**Supported networks**: Solana, Base

### How to Pay

1. **Create a payment intent**:

   ```bash
   curl -X POST https://vrf.mysterygift.fun/v1/payment/create \
     -H "Content-Type: application/json" \
     -d '{"network": "solana"}'
   ```

   Returns: `{ paymentId, paymentUrl, amount, currency, network, expiresAt }`

2. **Complete payment** via the facilitator payment URL

3. **Include payment proof** in request:

   ```bash
   curl -X POST https://vrf.mysterygift.fun/v1/randomness \
     -H "Content-Type: application/json" \
     -H "X-Payment: x402 <base64-proof>" \
     -d '{"request_hash": "optional-identifier"}'
   ```

4. **Payment proof format** (base64-encoded):
   ```json
   {
     "paymentId": "pay_abc123..."
   }
   ```

### Payment Verification

The facilitator verifies:

- Payment completed on-chain (Solana or Base)
- Correct amount received
- Payment not expired

The service enforces:

- Replay protection (each paymentId used once)
- Rate limiting per payment ID

---

## API Examples

### 1. Generate Random Seed

```bash
curl -X POST https://vrf.mysterygift.fun/v1/randomness \
  -H "X-Payment: x402 <proof>" \
  -H "Content-Type: application/json" \
  -d '{
    "request_hash": "my-app-request-123"
  }'
```

**Response**:

```json
{
  "random_seed": "a7f3c9d2e1b4...",
  "attestation": "base64-encoded-attestation",
  "timestamp": 1704729600000,
  "tee_type": "tdx",
  "app_id": "0fd4d6d4..."
}
```

### 2. Random Number

```bash
curl -X POST https://vrf.mysterygift.fun/v1/random/number \
  -H "X-Payment: x402 <proof>" \
  -d '{
    "min": 1,
    "max": 100
  }'
```

**Response**:

```json
{
  "number": 42,
  "min": 1,
  "max": 100,
  "random_seed": "...",
  "attestation": "...",
  "tee_type": "tdx"
}
```

### 3. Pick Winners

```bash
curl -X POST https://vrf.mysterygift.fun/v1/random/winners \
  -H "X-Payment: x402 <proof>" \
  -d '{
    "items": ["Alice", "Bob", "Charlie", "David"],
    "count": 2
  }'
```

**Response**:

```json
{
  "winners": [
    { "item": "Charlie", "index": 2, "position": 1 },
    { "item": "Alice", "index": 0, "position": 2 }
  ],
  "count": 2,
  "total_items": 4,
  "random_seed": "...",
  "attestation": "..."
}
```

### 4. Using API Key (Partners)

```bash
curl -X POST https://vrf.mysterygift.fun/v1/random/dice \
  -H "X-API-Key: your-secret-key" \
  -d '{"dice": "2d6"}'
```

---

## Input Limits

| Endpoint             | Limit                                 | Reason                      |
| -------------------- | ------------------------------------- | --------------------------- |
| `/v1/random/number`  | `max - min ≤ Number.MAX_SAFE_INTEGER` | Integer overflow prevention |
| `/v1/random/pick`    | `items.length ≤ 100,000`              | Memory/performance          |
| `/v1/random/shuffle` | `items.length ≤ 1,000`                | CPU-intensive operation     |
| `/v1/random/winners` | `items.length ≤ 100,000`              | Memory limits               |
| `/v1/random/dice`    | `1 ≤ dice ≤ 100`                      | Reasonable range            |
| `/v1/random/dice`    | `2 ≤ sides ≤ 1,000`                   | Reasonable range            |

---

## Error Responses

### 400 Bad Request

```json
{
  "error": "max is required and must be a positive number"
}
```

### 402 Payment Required

```json
{
  "error": "Payment Required",
  "message": "This endpoint requires payment via x402 protocol",
  "payment": {
    "amount": 1,
    "currency": "USD",
    "networks": ["solana", "base"],
    "facilitator_url": "https://facilitator.payai.network",
    "create_payment_endpoint": "/v1/payment/create",
    "x402_version": "1.1"
  }
}
```

### 429 Too Many Requests

```json
{
  "error": "Too many requests, please slow down"
}
```

### 500 Internal TEE Error

```json
{
  "error": "Internal TEE Error"
}
```

---

## Monitoring

### Logs

Monitor payment ID cache usage:

```
[TEE] Payment ID cache: 1234/10000 entries
```

Monitor facilitator verification:

```
[TEE] Payment verified: pay_abc123 { tx: "5J7K...", amount: "0.01" }
```

---

## Deployment

### Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Configure `PAYMENT_WALLET` (your Solana address)
- [ ] Set `X402_FACILITATOR_URL` (PayAI facilitator)
- [ ] Set `SUPPORTED_NETWORKS` (solana, base)
- [ ] Update `WHITELIST` for your domains
- [ ] Generate `API_KEYS` for partners
- [ ] Deploy worker to Phala Cloud
- [ ] Deploy landing page to Cloudflare Workers
- [ ] Test payment flow end-to-end (both chains)

### Health Check

```bash
curl https://vrf.mysterygift.fun/v1/health
```

**Response**:

```json
{
  "status": "ok",
  "tee_type": "tdx",
  "version": "0.0.5",
  "x402_enabled": true,
  "price_per_request": "$0.01",
  "verification_available": true
}
```

---

## Security

### Cryptographic Security

- **RNG**: `crypto.randomBytes(32)` - OS-backed secure random
- **Hash**: SHA-256 for attestation report data
- **TEE**: Intel TDX hardware isolation
- **Attestation**: Remote attestation via Phala dStack SDK

### Network Security

- **CORS**: Strict origin whitelist (production)
- **Rate Limits**: Multi-tier protection
- **Replay Protection**: LRU payment ID cache with TTL
- **Payment Verification**: Facilitator-based (chain-agnostic)

### Operational Security

- **Non-root user**: Docker runs as `node` user
- **Minimal image**: `node:20-slim` base
- **Dependency audit**: Regular security updates
- **Error monitoring**: GlitchTip integration

---

## Links

- **Live**: https://vrf.mysterygift.fun
- **Phala Cloud**: https://cloud.phala.network
- **Documentation**: https://docs.mysterygift.fun
- **x402 Protocol**: https://x402.org
- **Source Code**: https://github.com/MysteryGiftDotFun/verifiable-randomness-service

---

## Support

For issues, questions, or feature requests:

- GitHub Issues: https://github.com/MysteryGiftDotFun/verifiable-randomness-service/issues
- Email: hello@mysterygift.fun
- Twitter: @mysterygift_fun

---

## License

MIT
