# API Documentation

Detailed API reference for the Verifiable Randomness Service.

**Base URL**: `https://rng.mysterygift.fun`

---

## Table of Contents

1. [Authentication](#authentication)
2. [Rate Limits](#rate-limits)
3. [Error Handling](#error-handling)
4. [Endpoints](#endpoints)
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

1. **Whitelist** (highest priority) - Free access
2. **API Key** - Free access for partners
3. **x402 Payment** - $0.01 per request

### Whitelist

Add your origin or IP to the `WHITELIST` environment variable:

```bash
WHITELIST=mysterygift.fun,your-app.com,192.168.1.100
```

### API Key

Include in request header:

```http
X-API-Key: your-secret-key
```

### x402 Payment

1. Create a payment intent via `POST /v1/payment/create` (specify `network`: `solana` or `base`)
2. Complete payment through the facilitator payment URL
3. Include proof in header:

```http
X-Payment: x402 eyJwYXltZW50SWQiOiJwYXlfYWJjMTIzIn0=
```

**Proof structure** (before base64 encoding):

```json
{
  "paymentId": "pay_abc123..."
}
```

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
- `https://rng.mysterygift.fun`
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

**Authentication**: Required  
**Rate Limit**: 20/min

#### Request

```http
POST /v1/randomness HTTP/1.1
Host: rng.mysterygift.fun
Content-Type: application/json
X-Payment: x402 <base64-proof>

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
const response = await fetch('https://rng.mysterygift.fun/v1/random/number', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Payment': `x402 ${paymentProof}`,
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
    'https://rng.mysterygift.fun/v1/random/number',
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
# Roll 3d6
curl -X POST https://rng.mysterygift.fun/v1/random/dice \
  -H "X-Payment: x402 <proof>" \
  -d '{"dice": "3d6"}'

# Roll d20
curl -X POST https://rng.mysterygift.fun/v1/random/dice \
  -H "X-API-Key: <key>" \
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
// Using fetch API
async function getRandomNumber(min: number, max: number) {
  const response = await fetch('https://rng.mysterygift.fun/v1/random/number', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Payment': `x402 ${btoa(JSON.stringify(paymentProof))}`,
    },
    body: JSON.stringify({ min, max }),
  });

  if (!response.ok) {
    if (response.status === 429) {
      console.error('Rate limit exceeded');
    }
    throw new Error(`HTTP ${response.status}`);
  }

  const data = await response.json();
  return data.number;
}

// Usage
try {
  const random = await getRandomNumber(1, 100);
  console.log(`Random number: ${random}`);
} catch (error) {
  console.error('Failed to get random number:', error);
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
        'https://rng.mysterygift.fun/v1/random/winners',
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
# Random number
curl -X POST https://rng.mysterygift.fun/v1/random/number \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-secret-key" \
  -d '{"min": 1, "max": 100}'

# Roll dice
curl -X POST https://rng.mysterygift.fun/v1/random/dice \
  -H "X-Payment: x402 <proof>" \
  -d '{"dice": "2d20"}'

# Health check
curl https://rng.mysterygift.fun/v1/health
```

---

## Verification

### Verifying Attestation

The attestation can be verified using the Phala TEE verification tools:

```javascript
const attestation = JSON.parse(atob(response.attestation));

if (attestation.type === 'tdx-attestation') {
  // Verify quote using Phala SDK or Intel TDX tools
  const isValid = await verifyTDXQuote(attestation.quote);
  console.log('Attestation valid:', isValid);
} else if (attestation.type === 'mock-tee-attestation') {
  console.warn('Running in simulation mode - no hardware attestation');
}
```

---

## Best Practices

### 1. Create Payment, Then Use

Each payment ID is single-use. Create a new payment intent for each request:

```javascript
// 1. Create payment intent
const { paymentId, paymentUrl } = await fetch('/v1/payment/create', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ network: 'solana' }),
}).then(r => r.json());

// 2. Complete payment via paymentUrl (facilitator handles on-chain tx)

// 3. Use paymentId in proof
const proof = btoa(JSON.stringify({ paymentId }));
const result = await fetch('/v1/randomness', {
  method: 'POST',
  headers: { 'X-Payment': `x402 ${proof}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ request_hash: 'my-request' }),
}).then(r => r.json());
```

### 2. Handle Rate Limits

```javascript
async function fetchWithRetry(url, options, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    const response = await fetch(url, options);

    if (response.status === 429) {
      const resetTime = response.headers.get('X-RateLimit-Reset');
      const waitMs = parseInt(resetTime) * 1000 - Date.now();
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue;
    }

    return response;
  }
  throw new Error('Max retries exceeded');
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
  requestHash: 'my-app-123',
});
```

---

## Support

- **GitHub**: https://github.com/MysteryGiftDotFun/verifiable-randomness-service
- **Email**: hello@mysterygift.fun
- **Documentation**: https://docs.mysterygift.fun
