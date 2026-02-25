# API Documentation

Detailed API reference for the Verifiable Randomness Service.

**Base URL**: `https://vrf.mysterygift.fun`

---

## Table of Contents

1. [Authentication](#authentication)
2. [Testing x402 Payments](#testing-x402-payments)
3. [Rate Limits](#rate-limits)
4. [Error Handling](#error-handling)
5. [Endpoints](#endpoints)
   - [Generate Random Seed](#post-v1randomness)
   - [Random Number](#post-v1randomnumber)
   - [Random Dice](#post-v1randomdice)
   - [Pick Item](#post-v1randompick)
   - [Shuffle Array](#post-v1randomshuffle)
   - [Pick Winners](#post-v1randomwinners)
   - [Generate UUID](#post-v1randomuuid)
   - [Attestation](#get-v1attestation)
   - [Health Check](#get-v1health)

---

## Authentication

### Priority Order

1. **API Key** (highest priority) - Free access for partners
2. **x402 Payment** - $0.01 per request

### API Key

Include in request header:

```http
X-API-Key: your-secret-key
```

---

## Testing x402 Payments

**See [X402-INTEGRATION.md](./X402-INTEGRATION.md) for complete implementation details.**

### Option 1: Human UI (Browser)

1. Visit https://vrf.mysterygift.fun
2. Connect wallet (Solana via Phantom, Base via MetaMask)
3. Select network (Solana or Base)
4. Click "Generate Randomness"
5. Approve the transaction in your wallet

### Option 2: Programmatic Access

#### Step 1: Get Payment Requirements

```bash
curl -X POST https://vrf.mysterygift.fun/v1/random/number \
  -H "Content-Type: application/json" \
  -d '{"min": 1, "max": 100}'
```

Returns **402 Payment Required** with `PAYMENT-REQUIRED` header (base64-encoded):

```json
{
  "accepts": [
    {
      "scheme": "exact",
      "network": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
      "asset": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "payTo": "3Qudd5FG8foyFnbKxwfkDktnuushG7CDHBMSNk9owAjx",
      "amount": "10000",
      "maxTimeoutSeconds": 300,
      "extra": {
        "feePayer": "2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4"
      }
    },
    {
      "scheme": "exact",
      "network": "eip155:8453",
      "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      "payTo": "0x2d55488AD8dd2671c2F8D08FAad75908afa461c3",
      "amount": "10000",
      "maxTimeoutSeconds": 300
    }
  ]
}
```

#### Step 2: Build and Sign Payment

**For Solana:**

1. Build unsigned transaction with transfer instruction
2. Add compute budget instructions (must be first)
3. Set facilitator's `feePayer` as transaction feePayer
4. Sign with user's wallet
5. Serialize with `requireAllSignatures: false`

**For Base:**

1. Build EIP-712 typed data for EIP-3009 TransferWithAuthorization
2. Sign with MetaMask via `eth_signTypedData_v4`

#### Step 3: Submit with Payment

```bash
curl -X POST https://vrf.mysterygift.fun/v1/random/number \
  -H "Content-Type: application/json" \
  -H "PAYMENT-SIGNATURE: <base64-encoded-payment-payload>" \
  -d '{"min": 1, "max": 100}'
```

The `PAYMENT-SIGNATURE` header contains a base64-encoded JSON object:

```json
{
  "x402Version": 2,
  "resource": { "url": "...", "description": "...", "mimeType": "..." },
  "accepted": { "scheme": "exact", "network": "...", ... },
  "payload": { "transaction": "..." }  // or { "signature": "...", "authorization": {...} }
}
```

### Option 3: API Key (Free Access)

```bash
curl -X POST https://vrf.mysterygift.fun/v1/random/number \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-secret-key" \
  -d '{"min": 1, "max": 100}'
```

---

### RPC Requirements

This service uses x402 v2 with PayAI's hosted facilitator:

| Component           | RPC Required | Why                                     |
| ------------------- | ------------ | --------------------------------------- |
| Server (payment)    | **No**       | PayAI facilitator handles verification  |
| Server (randomness) | **No**       | Uses `crypto.randomBytes(32)`           |
| Client (Solana)     | **Yes**      | Build unsigned tx (blockhash, accounts) |
| Client (Base)       | **No**       | MetaMask handles everything             |

For **server-to-server** API calls, build transactions externally - no RPC needed on your infrastructure.

---

## Rate Limits

### Global Rate Limit

- **Limit**: 100 requests/minute per IP
- **Applies to**: All `/v1/*` routes
- **Headers**:
  ```http
  X-RateLimit-Limit: 100
  X-RateLimit-Remaining: 95
  X-RateLimit-Reset: 1704729600
  ```

### Paid Endpoint Rate Limit

- **Limit**: 20 requests/minute per payment ID
- **Applies to**: POST `/v1/randomness`, `/v1/random/*`
- **Key**: Payment ID OR IP address

### Rate Limit Response

**Status**: `429 Too Many Requests`

```json
{
  "error": "Too many requests, please slow down"
}
```

**Retry After**: Check `X-RateLimit-Reset` header

---

## CORS Policy

### Production

**Allowed Origins**:

- `https://mysterygift.fun`
- `https://vrf.mysterygift.fun`
- `https://*.mysterygift.fun` (all subdomains)

**Blocked**: All other origins receive no CORS headers

### Development

**Allowed Origins**: All (`NODE_ENV=development`)

---

## Error Handling

### Error Response Format

```json
{
  "error": "Short error message",
  "message": "Detailed explanation (optional)"
}
```

### HTTP Status Codes

| Code  | Meaning               | Common Causes                              |
| ----- | --------------------- | ------------------------------------------ |
| `400` | Bad Request           | Invalid input, missing parameters          |
| `402` | Payment Required      | No valid payment proof provided            |
| `429` | Too Many Requests     | Rate limit exceeded                        |
| `500` | Internal Server Error | TEE error, facilitator unavailable         |
| `502` | Bad Gateway           | TEE Worker unavailable (landing page only) |

---

## Endpoints

### POST /v1/randomness

Generate a 256-bit cryptographically secure random seed.

**Authentication**: Required (API Key or x402 Payment)  
**Rate Limit**: 20/min

#### Request

```http
POST /v1/randomness HTTP/1.1
Host: vrf.mysterygift.fun
Content-Type: application/json
PAYMENT-SIGNATURE: <base64-encoded-x402-payload>

{
  "request_hash": "optional-identifier",
  "metadata": {
    "app": "my-app",
    "session": "abc123"
  }
}
```

**Parameters**:

- `request_hash` (string, optional): Application-specific identifier
- `metadata` (object, optional): Application metadata (max 1KB)

#### Response

```json
{
  "random_seed": "a7f3c9d2e1b4f6c8a9e5d3b7c1f4e8a2d9b6c3f7e1a5d8b4c6f2e9a3d7b1c5f8",
  "attestation": "eyJ0eXBlIjoidGR4LWF0dGVzdGF0aW9uIiwicXVvdGUiOiIuLi4ifQ==",
  "timestamp": 1704729600000,
  "tee_type": "tdx",
  "app_id": "0fd4d6d4ad7d850389643319dd0e35ad14f578a5"
}
```

**Response Fields**:

- `random_seed` (string): 64-character hex string (256 bits)
- `attestation` (string): Base64-encoded TEE attestation
- `timestamp` (number): Unix timestamp (milliseconds)
- `tee_type` (string): `"tdx"` or `"simulation"`
- `app_id` (string): Phala app identifier

---

### POST /v1/random/number

Generate a random integer between `min` and `max` (inclusive).

**Authentication**: Required  
**Rate Limit**: 20/min

#### Request

```json
{
  "min": 1,
  "max": 100,
  "request_hash": "optional"
}
```

**Parameters**:

- `min` (number, default: 1): Minimum value (inclusive)
- `max` (number, required): Maximum value (inclusive)
- `request_hash` (string, optional): Identifier for attestation

**Constraints**:

- `0 ≤ min < max ≤ Number.MAX_SAFE_INTEGER`
- `max - min ≤ 1,000,000,000` (1 billion range)

#### Response

```json
{
  "number": 42,
  "min": 1,
  "max": 100,
  "random_seed": "...",
  "attestation": "...",
  "timestamp": 1704729600000,
  "tee_type": "tdx"
}
```

#### Examples

**JavaScript**:

```javascript
const response = await fetch("https://vrf.mysterygift.fun/v1/random/number", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Payment": `x402 ${paymentProof}`,
  },
  body: JSON.stringify({ min: 1, max: 6 }), // Dice roll
});

const { number } = await response.json();
console.log(`Rolled: ${number}`);
```

**Python**:

```python
import requests

response = requests.post(
    'https://vrf.mysterygift.fun/v1/random/number',
    headers={'X-Payment': f'x402 {payment_proof}'},
    json={'min': 0, 'max': 99}
)

number = response.json()['number']
print(f'Random: {number}')
```

---

### POST /v1/random/dice

Roll dice using standard notation (e.g., "2d6", "1d20").

**Authentication**: Required  
**Rate Limit**: 20/min

#### Request

```json
{
  "dice": "2d6",
  "request_hash": "optional"
}
```

**Parameters**:

- `dice` (string, required): Dice notation `NdM`
  - `N`: Number of dice (1-100)
  - `M`: Number of sides (2-1000)

#### Response

```json
{
  "dice": "2d6",
  "rolls": [3, 5],
  "total": 8,
  "min_possible": 2,
  "max_possible": 12,
  "random_seed": "...",
  "attestation": "...",
  "tee_type": "tdx"
}
```

#### Examples

```bash
# Roll 3d6 with API key
curl -X POST https://vrf.mysterygift.fun/v1/random/dice \
  -H "X-API-Key: <key>" \
  -d '{"dice": "3d6"}'

# Roll d20 with x402 payment
curl -X POST https://vrf.mysterygift.fun/v1/random/dice \
  -H "PAYMENT-SIGNATURE: <base64-payload>" \
  -d '{"dice": "1d20"}'
```

---

### POST /v1/random/pick

Pick one random item from an array.

**Authentication**: Required  
**Rate Limit**: 20/min

#### Request

```json
{
  "items": ["Alice", "Bob", "Charlie", "David"],
  "request_hash": "optional"
}
```

**Parameters**:

- `items` (array, required): Non-empty array (max 100,000 elements)
- `request_hash` (string, optional): Identifier

#### Response

```json
{
  "picked": "Charlie",
  "index": 2,
  "total_items": 4,
  "random_seed": "...",
  "attestation": "...",
  "tee_type": "tdx"
}
```

---

### POST /v1/random/shuffle

Shuffle an array using the Fisher-Yates algorithm.

**Authentication**: Required  
**Rate Limit**: 20/min

#### Request

```json
{
  "items": ["A", "B", "C", "D", "E"],
  "request_hash": "optional"
}
```

**Parameters**:

- `items` (array, required): Array to shuffle (max 1,000 elements)

**Constraints**: Array length ≤ 1,000 (CPU-intensive operation)

#### Response

```json
{
  "shuffled": ["D", "A", "E", "B", "C"],
  "original_count": 5,
  "random_seed": "...",
  "attestation": "...",
  "tee_type": "tdx"
}
```

---

### POST /v1/random/winners

Pick multiple unique winners from an array.

**Authentication**: Required  
**Rate Limit**: 20/min

#### Request

```json
{
  "items": ["Alice", "Bob", "Charlie", "David", "Eve"],
  "count": 3,
  "request_hash": "optional"
}
```

**Parameters**:

- `items` (array, required): Array of candidates (max 100,000)
- `count` (number, required): Number of winners to select
- `request_hash` (string, optional): Identifier

**Constraints**:

- `1 ≤ count ≤ items.length`
- `items.length ≤ 100,000`

#### Response

```json
{
  "winners": [
    { "item": "Charlie", "index": 2, "position": 1 },
    { "item": "Alice", "index": 0, "position": 2 },
    { "item": "Eve", "index": 4, "position": 3 }
  ],
  "count": 3,
  "total_items": 5,
  "random_seed": "...",
  "attestation": "...",
  "tee_type": "tdx"
}
```

**Algorithm**: Fisher-Yates partial shuffle (deterministic, collision-free)

---

### POST /v1/random/uuid

Generate a cryptographically secure UUIDv4.

**Authentication**: Required  
**Rate Limit**: 20/min

#### Request

```json
{
  "request_hash": "optional"
}
```

#### Response

```json
{
  "uuid": "8f7a3c9d-2e1b-4f6c-8a9e-5d3b7c1f4e8a",
  "random_seed": "...",
  "attestation": "...",
  "tee_type": "tdx"
}
```

---

### GET /v1/attestation

Get TEE attestation information.

**Authentication**: Not required  
**Rate Limit**: 100/min (global only)

#### Response

```json
{
  "app_id": "0fd4d6d4ad7d850389643319dd0e35ad14f578a5",
  "compose_hash": "sha256:abc123...",
  "instance_id": "i-1234567890",
  "tee_type": "tdx",
  "attestation_available": true
}
```

---

### GET /v1/health

Health check endpoint.

**Authentication**: Not required  
**Rate Limit**: 100/min (global only)

#### Response

```json
{
  "status": "ok",
  "tee_type": "tdx",
  "version": "0.0.5",
  "x402_enabled": true,
  "price_per_request": "$0.01",
  "app_id": "0fd4d6d4...",
  "verification_available": true,
  "endpoints": [
    "POST /v1/randomness - Raw 256-bit seed",
    "POST /v1/random/number - Random number in range",
    ...
  ]
}
```

---

## Code Examples

### JavaScript/TypeScript

```typescript
// Using fetch API with x402 payment
async function getRandomNumber(min: number, max: number) {
  const response = await fetch("https://vrf.mysterygift.fun/v1/random/number", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "PAYMENT-SIGNATURE": btoa(JSON.stringify(paymentPayload)),
    },
    body: JSON.stringify({ min, max }),
  });

  if (!response.ok) {
    if (response.status === 429) {
      console.error("Rate limit exceeded");
    }
    throw new Error(`HTTP ${response.status}`);
  }

  const data = await response.json();
  return data.number;
}

// Usage with API key (free access)
async function getRandomNumberWithApiKey(
  min: number,
  max: number,
  apiKey: string,
) {
  const response = await fetch("https://vrf.mysterygift.fun/v1/random/number", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify({ min, max }),
  });

  return response.json();
}

// Usage
try {
  const random = await getRandomNumber(1, 100);
  console.log(`Random number: ${random}`);
} catch (error) {
  console.error("Failed to get random number:", error);
}
```

### Python

```python
import requests
import base64
import json

def get_random_winners(items, count, api_key=None):
    headers = {'Content-Type': 'application/json'}

    if api_key:
        headers['X-API-Key'] = api_key

    response = requests.post(
        'https://vrf.mysterygift.fun/v1/random/winners',
        headers=headers,
        json={'items': items, 'count': count}
    )

    response.raise_for_status()
    return response.json()['winners']

# Usage
winners = get_random_winners(['Alice', 'Bob', 'Charlie'], 2, 'your-api-key')
for winner in winners:
    print(f"{winner['position']}. {winner['item']}")
```

### cURL

```bash
# Random number with API key
curl -X POST https://vrf.mysterygift.fun/v1/random/number \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-secret-key" \
  -d '{"min": 1, "max": 100}'

# Random number with x402 payment
curl -X POST https://vrf.mysterygift.fun/v1/random/number \
  -H "Content-Type: application/json" \
  -H "PAYMENT-SIGNATURE: <base64-encoded-payload>" \
  -d '{"min": 1, "max": 100}'

# Roll dice
curl -X POST https://vrf.mysterygift.fun/v1/random/dice \
  -H "X-API-Key: your-secret-key" \
  -d '{"dice": "2d20"}'

# Health check
curl https://vrf.mysterygift.fun/v1/health
```

---

## Verification

### Verifying Attestation

The attestation can be verified using the Phala TEE verification tools:

```javascript
const attestation = JSON.parse(atob(response.attestation));

if (attestation.type === "tdx-attestation") {
  // Verify quote using Phala SDK or Intel TDX tools
  const isValid = await verifyTDXQuote(attestation.quote);
  console.log("Attestation valid:", isValid);
} else if (attestation.type === "mock-tee-attestation") {
  console.warn("Running in simulation mode - no hardware attestation");
}
```

---

## Best Practices

### 1. Build Payment Externally for Server-to-Server

For programmatic access, build and sign the payment transaction externally:

```javascript
// Solana: Build tx externally, sign with your keypair
// Base: Sign EIP-712 typed data with your private key

const paymentPayload = {
  x402Version: 2,
  resource: { url: "https://vrf.mysterygift.fun/v1/randomness", ... },
  accepted: { scheme: "exact", network: "...", ... },
  payload: { transaction: "..." }  // or { signature: "...", authorization: {...} }
};

const result = await fetch("https://vrf.mysterygift.fun/v1/randomness", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "PAYMENT-SIGNATURE": btoa(JSON.stringify(paymentPayload)),
  },
  body: JSON.stringify({ request_hash: "my-request" }),
}).then((r) => r.json());
```

### 2. Handle Rate Limits

```javascript
async function fetchWithRetry(url, options, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    const response = await fetch(url, options);

    if (response.status === 429) {
      const resetTime = response.headers.get("X-RateLimit-Reset");
      const waitMs = parseInt(resetTime) * 1000 - Date.now();
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue;
    }

    return response;
  }
  throw new Error("Max retries exceeded");
}
```

### 3. Store Attestations

Save attestations for later verification:

```javascript
const result = await response.json();

// Store for auditing
await db.save({
  randomSeed: result.random_seed,
  attestation: result.attestation,
  timestamp: result.timestamp,
  teeType: result.tee_type,
  requestHash: "my-app-123",
});
```

---

## Support

- **GitHub**: https://github.com/MysteryGiftDotFun/verifiable-randomness-service
- **Email**: hello@mysterygift.fun
- **Documentation**: https://docs.mysterygift.fun
