# API Documentation

Detailed API reference for the Verifiable Randomness Service.

**Base URL**: `https://vrf.mysterygift.fun`

---

## Table of Contents

1. [Quick Start](#quick-start) - Copy-paste examples
2. [Authentication](#authentication)
3. [x402 Payment Flow](#x402-payment-flow) - Complete guide
4. [Rate Limits](#rate-limits)
5. [Error Handling](#error-handling)
6. [Endpoints](#endpoints)
   - [Random Number](#post-v1randomnumber)
   - [Random Dice](#post-v1randomdice)
   - [Pick Item](#post-v1randompick)
   - [Shuffle Array](#post-v1randomshuffle)
   - [Pick Winners](#post-v1randomwinners)
   - [Generate UUID](#post-v1randomuuid)
   - [Generate Random Seed](#post-v1randomness)
   - [Attestation](#get-v1attestation)
   - [Health Check](#get-v1health)
7. [Code Examples](#code-examples)

---

## Quick Start

### Option 1: Browser (Web UI)

Visit **https://vrf.mysterygift.fun** - connect your wallet and click Generate.

### Option 2: CLI Tool (Node.js)

For command-line programmatic testing with your private key:

```bash
# Clone the repository
git clone https://github.com/MysteryGiftDotFun/verifiable-randomness-service.git
cd verifiable-randomness-service/worker

# Install dependencies
npm install

# Run with Base (EVM) - requires private key with USDC on Base
NETWORK=base PRIVATE_KEY=0xYOUR_BASE_PRIVATE_KEY node test-x402-payment.cjs

# Run with Solana - requires private key with USDC on Solana
NETWORK=solana PRIVATE_KEY=YOUR_BASE58_PRIVATE_KEY node test-x402-payment.cjs

# With custom VRF URL (for testing staging)
VRF_URL=https://rng-dev.mysterygift.fun NETWORK=base PRIVATE_KEY=0x... node test-x402-payment.cjs
```

**Environment Variables:**
| Variable | Required | Description |
|----------|----------|-------------|
| `NETWORK` | Yes | `base` or `solana` |
| `PRIVATE_KEY` | Yes | Wallet private key (with `0x` prefix for Base) |
| `VRF_URL` | No | VRF service URL (default: `https://vrf.mysterygift.fun`) |

### Option 3: cURL (Command Line)

```bash
# Random number with API key
curl -X POST https://vrf.mysterygift.fun/v1/random/number \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{"min": 1, "max": 100}'
```

**Note:** cURL cannot do x402 payments directly (requires cryptographic signing). Use the CLI tool above for command-line payments.

### Option 4: JavaScript/TypeScript (API Key)

```javascript
// Quick example - generates a random number
const response = await fetch("https://vrf.mysterygift.fun/v1/random/number", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-API-Key": "your-api-key", // Or use x402 payment
  },
  body: JSON.stringify({ min: 1, max: 100 }),
});

const data = await response.json();
console.log(`Random number: ${data.number}`);
// Output: { number: 42, min: 1, max: 100, operation: "number", random_seed: "...", attestation: "...", timestamp: ..., tee_type: "tdx" }
```

### Option 5: Python

```python
import requests

response = requests.post(
    "https://vrf.mysterygift.fun/v1/random/number",
    headers={"X-API-Key": "your-api-key"},
    json={"min": 1, "max": 6}
)

data = response.json()
print(f"Rolled: {data['number']}")  # e.g., Rolled: 4
```

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

## x402 Payment Flow

The **recommended** way for end users. No API keys needed - pay $0.01 per request via USDC.

### How It Works

```
1. Client sends request → Server returns 402 with payment requirements
2. Client builds payment (Solana tx or EVM signature)
3. Client retries request with payment in header → Server verifies via PayAI
4. Server returns randomness + attestation
```

### Step-by-Step Guide

#### Step 1: Make Request (Get 402)

```bash
curl -X POST https://vrf.mysterygift.fun/v1/random/number \
  -H "Content-Type: application/json" \
  -d '{"min": 1, "max": 100}'
```

Response: `402 Payment Required` with header:

```
payment-required: <base64-encoded-json>
```

Decode the header to get payment requirements:

```json
{
  "accepts": [
    {
      "scheme": "exact",
      "network": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
      "asset": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "payTo": "3Qudd5FG8foyFnbKxwfkDktnuushG7CDHBMSNk9owAjx",
      "amount": "10000", // $0.01 USDC (6 decimals)
      "maxTimeoutSeconds": 300,
      "extra": { "feePayer": "..." }
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

#### Step 2: Build Payment Payload

**For Base (EVM) - Use MetaMask:**

```javascript
// Sign this with MetaMask (eth_signTypedData_v4)
const typedData = {
  domain: {
    name: "USD Coin",
    version: "2",
    chainId: 8453,
    verifyingContract: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  },
  message: {
    from: "0xYourWalletAddress",
    to: "0x2d55488AD8dd2671c2F8D08FAad75908afa461c3",
    value: "10000",
    validAfter: "0",
    validBefore: "${Math.floor(Date.now()/1000) + 300}",
    nonce: "${generateRandomNonce()}",
  },
  primaryType: "TransferWithAuthorization",
  types: {
    TransferWithAuthorization: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
    ],
  },
};
```

**For Solana - Use Phantom:**

Build a transaction with facilitator as feePayer (see [X402-INTEGRATION.md](./X402-INTEGRATION.md) for full code).

#### Step 3: Submit with Payment

```bash
curl -X POST https://vrf.mysterygift.fun/v1/random/number \
  -H "Content-Type: application/json" \
  -H "PAYMENT-SIGNATURE: $(echo '{"x402Version":2,"resource":{"url":"https://vrf.mysterygift.fun/v1/random/number","description":"Random Number Generation","mimeType":"application/json"},"accepted":{"scheme":"exact","network":"eip155:8453","amount":"10000","asset":"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913","payTo":"0x2d55488AD8dd2671c2F8D08FAad75908afa461c3","maxTimeoutSeconds":300},"payload":{"signature":"0x...","authorization":{"from":"0x...","to":"0x2d55488AD8dd2671c2F8D08FAad75908afa461c3","value":"10000","validAfter":"0","validBefore":"...","nonce":"0x..."}},"extensions":{}}' | base64 -w0)" \
  -d '{"min": 1, "max": 100}'
```

### Complete JavaScript Example (Base/EVM)

```javascript
/**
 * VRF API Client with x402 Payment
 * Works in browser with MetaMask
 */

const VRF_URL = "https://vrf.mysterygift.fun";
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

// Generate random 32-byte nonce
function generateNonce() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return (
    "0x" +
    Array.from(array)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}

// Build EIP-712 typed data
function buildTypedData(from, to, value, validAfter, validBefore, nonce) {
  return {
    domain: {
      name: "USD Coin",
      version: "2",
      chainId: 8453,
      verifyingContract: USDC_BASE,
    },
    message: {
      from,
      to,
      value: value.toString(),
      validAfter: validAfter.toString(),
      validBefore: validBefore.toString(),
      nonce,
    },
    primaryType: "TransferWithAuthorization",
    types: {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    },
  };
}

// Main function
async function getRandomNumber(min, max) {
  // Step 1: Request (will get 402)
  let response = await fetch(`${VRF_URL}/v1/random/number`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ min, max }),
  });

  if (response.status !== 402) {
    return response.json(); // Already paid or free
  }

  // Step 2: Get payment requirements
  const paymentHeader = response.headers.get("payment-required");
  const paymentReq = JSON.parse(atob(paymentHeader));
  const accept = paymentReq.accepts.find((a) =>
    a.network.startsWith("eip155:"),
  );

  // Step 3: Build payment
  const accounts = await window.ethereum.request({
    method: "eth_requestAccounts",
  });
  const wallet = accounts[0];

  const validAfter = 0;
  const validBefore = Math.floor(Date.now() / 1000) + 300;
  const nonce = generateNonce();

  const typedData = buildTypedData(
    wallet,
    accept.payTo,
    accept.amount,
    validAfter,
    validBefore,
    nonce,
  );

  const signature = await window.ethereum.request({
    method: "eth_signTypedData_v4",
    params: [wallet, JSON.stringify(typedData)],
  });

  const paymentPayload = {
    x402Version: 2,
    resource: {
      url: `${VRF_URL}/v1/random/number`,
      description: "Random Number Generation",
      mimeType: "application/json",
    },
    accepted: {
      scheme: "exact",
      network: accept.network,
      amount: accept.amount,
      asset: accept.asset,
      payTo: accept.payTo,
      maxTimeoutSeconds: accept.maxTimeoutSeconds,
      extra: accept.extra,
    },
    payload: {
      signature,
      authorization: {
        from: wallet,
        to: accept.payTo,
        value: accept.amount,
        validAfter: validAfter.toString(),
        validBefore: validBefore.toString(),
        nonce,
      },
    },
    extensions: {},
  };

  // Step 4: Submit with payment
  response = await fetch(`${VRF_URL}/v1/random/number`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "PAYMENT-SIGNATURE": btoa(JSON.stringify(paymentPayload)),
    },
    body: JSON.stringify({ min, max }),
  });

  return response.json();
}

// Usage
getRandomNumber(1, 100).then((result) => {
  console.log(`Random: ${result.number}`);
  console.log(`Seed: ${result.random_seed}`);
  console.log(`Operation: ${result.operation}`);
  // { number: 42, min: 1, max: 100, operation: "number", random_seed: "...", attestation: "...", timestamp: ..., tee_type: "tdx", commitment: {...} }
});
```

### Complete Python Example (Base/EVM)

```python
"""
VRF API Client with x402 Payment (Python)
Requires: requests, web3
Install: pip install requests web3
"""
import json
import base64
import time
import secrets
import requests
from web3 import Web3

# Configuration
VRF_URL = "https://vrf.mysterygift.fun"
PRIVATE_KEY = "0x..."  # Your Base wallet private key

# Constants
USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
PAYTO_BASE = "0x2d55488AD8dd2671c2F8D08FAad75908afa461c3"
CHAIN_ID = 8453


def generate_nonce():
    """Generate random 32-byte nonce"""
    return "0x" + secrets.token_hex(32)


def build_typed_data(from_addr, to_addr, value, valid_after, valid_before, nonce):
    """Build EIP-712 typed data for TransferWithAuthorization"""
    return {
        "domain": {
            "name": "USD Coin",
            "version": "2",
            "chainId": CHAIN_ID,
            "verifyingContract": USDC_BASE
        },
        "message": {
            "from": from_addr,
            "to": to_addr,
            "value": str(value),
            "validAfter": str(valid_after),
            "validBefore": str(valid_before),
            "nonce": nonce
        },
        "primaryType": "TransferWithAuthorization",
        "types": {
            "TransferWithAuthorization": [
                {"name": "from", "type": "address"},
                {"name": "to", "type": "address"},
                {"name": "value", "type": "uint256"},
                {"name": "validAfter", "type": "uint256"},
                {"name": "validBefore", "type": "uint256"},
                {"name": "nonce", "type": "bytes32"}
            ]
        }
    }


def get_random_number(min_val, max_val):
    """
    Get a random number with x402 payment
    """
    # Step 1: Request (expect 402)
    resp = requests.post(
        f"{VRF_URL}/v1/random/number",
        headers={"Content-Type": "application/json"},
        json={"min": min_val, "max": max_val}
    )

    if resp.status_code != 402:
        return resp.json()

    # Step 2: Get payment requirements
    payment_header = resp.headers.get("payment-required")
    payment_req = json.loads(base64.b64decode(payment_header))
    accept = next(a for a in payment_req["accepts"] if a["network"].startswith("eip155"))

    # Step 3: Sign with wallet
    w3 = Web3()
    wallet = w3.eth.account.from_key(PRIVATE_KEY)

    valid_after = 0
    valid_before = int(time.time()) + 300
    nonce = generate_nonce()

    typed_data = build_typed_data(
        wallet.address, accept["payTo"], accept["amount"],
        valid_after, valid_before, nonce
    )

    # Sign the typed data
    signed = wallet.sign_typed_data(typed_data)

    # Step 4: Build payment payload
    payment_payload = {
        "x402Version": 2,
        "resource": {
            "url": f"{VRF_URL}/v1/random/number",
            "description": "Random Number Generation",
            "mimeType": "application/json"
        },
        "accepted": {
            "scheme": "exact",
            "network": accept["network"],
            "amount": accept["amount"],
            "asset": accept["asset"],
            "payTo": accept["payTo"],
            "maxTimeoutSeconds": accept["maxTimeoutSeconds"],
            "extra": accept.get("extra")
        },
        "payload": {
            "signature": signed.signature.hex(),
            "authorization": {
                "from": wallet.address,
                "to": accept["payTo"],
                "value": accept["amount"],
                "validAfter": str(valid_after),
                "validBefore": str(valid_before),
                "nonce": nonce
            }
        },
        "extensions": {}
    }

    # Step 5: Submit with payment
    resp = requests.post(
        f"{VRF_URL}/v1/random/number",
        headers={
            "Content-Type": "application/json",
            "PAYMENT-SIGNATURE": base64.b64encode(json.dumps(payment_payload).encode()).decode()
        },
        json={"min": min_val, "max": max_val}
    )

    return resp.json()


# Usage
if __name__ == "__main__":
    result = get_random_number(1, 100)
    print(f"Random: {result['number']}")
    print(f"Range: {result['min']} - {result['max']}")
    print(f"Operation: {result['operation']}")
    print(f"Seed: {result['random_seed']}")
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
  "operation": "randomness",
  "random_seed": "a7f3c9d2e1b4f6c8a9e5d3b7c1f4e8a2d9b6c3f7e1a5d8b4c6f2e9a3d7b1c5f8",
  "attestation": "eyJ0eXBlIjoidGR4LWF0dGVzdGF0aW9uIiwicXVvdGUiOiIuLi4ifQ==",
  "timestamp": 1704729600000,
  "tee_type": "tdx",
  "app_id": "0fd4d6d4ad7d850389643319dd0e35ad14f578a5"
}
```

**Response Fields**:

- `operation` (string): Type of operation (`"randomness"`, `"number"`, `"dice"`, `"pick"`, `"shuffle"`, `"winners"`, `"uuid"`)
- `random_seed` (string): 64-character hex string (256 bits)
- `attestation` (string): Base64-encoded TEE attestation
- `timestamp` (number): Unix timestamp (milliseconds)
- `tee_type` (string): `"tdx"` or `"simulation"`
- `app_id` (string): Phala app identifier
- `commitment` (object, optional): Arweave proof if enabled

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
  "operation": "number",
  "number": 42,
  "min": 1,
  "max": 100,
  "random_seed": "a7f3c9d2e1b4f6c8a9e5d3b7c1f4e8a2d9b6c3f7e1a5d8b4c6f2e9a3d7b1c5f8",
  "attestation": "eyJ0eXBlIjoidGR4LWF0dGVzdGF0aW9uIiwicXVvdGUiOiIuLi4ifQ==",
  "timestamp": 1704729600000,
  "tee_type": "tdx",
  "commitment": {
    "commitment_hash": "abc123...",
    "arweave_tx": "xyz789",
    "arweave_url": "https://arweave.net/xyz789",
    "encrypted": false
  }
}
```

**Response Fields**:

- `operation` (string): `"number"`
- `number` (number): The random number
- `min`, `max` (number): Range bounds
- `random_seed` (string): 64-char hex string (256-bit)
- `attestation` (string): Base64-encoded TEE attestation
- `timestamp` (number): Unix timestamp (ms)
- `tee_type` (string): `"tdx"` or `"simulation"`
- `commitment` (object): Arweave proof (if enabled)

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
  "operation": "dice",
  "dice": "2d6",
  "rolls": [3, 5],
  "total": 8,
  "min_possible": 2,
  "max_possible": 12,
  "random_seed": "a7f3c9d2e1b4f6c8a9e5d3b7c1f4e8a2d9b6c3f7e1a5d8b4c6f2e9a3d7b1c5f8",
  "attestation": "eyJ0eXBlIjoidGR4LWF0dGVzdGF0aW9uIiwicXVvdGUiOiIuLi4ifQ==",
  "timestamp": 1704729600000,
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
  "operation": "pick",
  "picked": "Charlie",
  "index": 2,
  "total_items": 4,
  "random_seed": "a7f3c9d2e1b4f6c8a9e5d3b7c1f4e8a2d9b6c3f7e1a5d8b4c6f2e9a3d7b1c5f8",
  "attestation": "eyJ0eXBlIjoidGR4LWF0dGVzdGF0aW9uIiwicQUdGUiOiIuLi4ifQ==",
  "timestamp": 1704729600000,
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
  "operation": "shuffle",
  "shuffled": ["D", "A", "E", "B", "C"],
  "original_count": 5,
  "random_seed": "a7f3c9d2e1b4f6c8a9e5d3b7c1f4e8a2d9b6c3f7e1a5d8b4c6f2e9a3d7b1c5f8",
  "attestation": "eyJ0eXBlIjoidGR4LWF0dGVzdGF0aW9uIiwicXVvdGUiOiIuLi4ifQ==",
  "timestamp": 1704729600000,
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
  "operation": "winners",
  "winners": [
    { "item": "Charlie", "index": 2, "position": 1 },
    { "item": "Alice", "index": 0, "position": 2 },
    { "item": "Eve", "index": 4, "position": 3 }
  ],
  "count": 3,
  "total_items": 5,
  "random_seed": "a7f3c9d2e1b4f6c8a9e5d3b7c1f4e8a2d9b6c3f7e1a5d8b4c6f2e9a3d7b1c5f8",
  "attestation": "eyJ0eXBlIjoidGR4LWF0dGVzdGF0aW9uIiwicXVvdGUiOiIuLi4ifQ==",
  "timestamp": 1704729600000,
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
  "operation": "uuid",
  "uuid": "8f7a3c9d-2e1b-4f6c-8a9e-5d3b7c1f4e8a",
  "random_seed": "a7f3c9d2e1b4f6c8a9e5d3b7c1f4e8a2d9b6c3f7e1a5d8b4c6f2e9a3d7b1c5f8",
  "attestation": "eyJ0eXBlIjoidGR4LWF0dGVzdGF0aW9uIiwicXVvdGUiOiIuLi4ifQ==",
  "timestamp": 1704729600000,
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
// Using API key (simplest - no wallet needed)
async function getRandomNumber(min: number, max: number, apiKey: string) {
  const response = await fetch("https://vrf.mysterygift.fun/v1/random/number", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify({ min, max }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  return data;
}

// Usage with API key
const result = await getRandomNumber(1, 100, "your-api-key");
console.log(`Random number: ${result.number}`); // e.g., 42
console.log(`Range: ${result.min} - ${result.max}`); // 1 - 100
console.log(`Operation: ${result.operation}`); // "number"
console.log(`Seed: ${result.random_seed}`); // 64-char hex
console.log(`TEE: ${result.tee_type}`); // "tdx"
```

### JavaScript with x402 Payment (Browser)

```typescript
// Full x402 payment flow - for browser with MetaMask
async function getRandomNumberWithPayment(min: number, max: number) {
  // Step 1: Request (expect 402)
  let response = await fetch("https://vrf.mysterygift.fun/v1/random/number", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ min, max }),
  });

  if (response.status !== 402) {
    return response.json(); // Free or already paid
  }

  // Step 2: Build payment (see complete example in x402 Payment Flow section)
  const paymentPayload = await buildPaymentPayload(response.headers);

  // Step 3: Submit with payment
  response = await fetch("https://vrf.mysterygift.fun/v1/random/number", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "PAYMENT-SIGNATURE": btoa(JSON.stringify(paymentPayload)),
    },
    body: JSON.stringify({ min, max }),
  });

  return response.json();
}

// Usage
const result = await getRandomNumberWithPayment(1, 6);
console.log(`Dice roll: ${result.number}`); // e.g., 4
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

### Node.js with x402 Payment (Server-Side)

For server-side Node.js with ethers.js (not browser):

```typescript
/**
 * VRF API Client with x402 Payment (Node.js)
 * Works in server-side Node.js with ethers.js v6
 *
 * Install: npm install ethers axios
 */
import { ethers } from "ethers";
import axios from "axios";

const VRF_URL = "https://vrf.mysterygift.fun";
const PRIVATE_KEY = process.env.VRF_PRIVATE_KEY || "0x..."; // Your Base wallet private key

// Constants
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const CHAIN_ID = 8453;

function generateNonce(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return "0x" + Buffer.from(array).toString("hex");
}

async function getRandomNumber(min: number, max: number) {
  // Step 1: Get payment requirements
  let resp = await axios.post(
    `${VRF_URL}/v1/random/number`,
    { min, max },
    { headers: { "Content-Type": "application/json" } },
  );

  if (resp.status !== 402) {
    return resp.data;
  }

  // Decode payment requirements from header
  const paymentReq = JSON.parse(
    Buffer.from(resp.headers["payment-required"], "base64").toString(),
  );
  const accept = paymentReq.accepts.find((a: any) =>
    a.network.startsWith("eip155"),
  );

  // Step 2: Build and sign authorization
  const wallet = new ethers.Wallet(PRIVATE_KEY);
  const validAfter = 0;
  const validBefore = Math.floor(Date.now() / 1000) + 300;
  const nonce = generateNonce();

  const domain = {
    name: "USD Coin",
    version: "2",
    chainId: CHAIN_ID,
    verifyingContract: USDC_BASE,
  };

  const types = {
    TransferWithAuthorization: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
    ],
  };

  const message = {
    from: wallet.address,
    to: accept.payTo,
    value: accept.amount,
    validAfter: validAfter.toString(),
    validBefore: validBefore.toString(),
    nonce,
  };

  // Sign the typed data
  const signature = await wallet.signTypedData(domain, types, message);

  // Step 3: Build payment payload
  const paymentPayload = {
    x402Version: 2,
    resource: {
      url: `${VRF_URL}/v1/random/number`,
      description: "Random Number Generation",
      mimeType: "application/json",
    },
    accepted: {
      scheme: "exact",
      network: accept.network,
      amount: accept.amount,
      asset: accept.asset,
      payTo: accept.payTo,
      maxTimeoutSeconds: accept.maxTimeoutSeconds,
      extra: accept.extra,
    },
    payload: {
      signature,
      authorization: {
        from: wallet.address,
        to: accept.payTo,
        value: accept.amount,
        validAfter: validAfter.toString(),
        validBefore: validBefore.toString(),
        nonce,
      },
    },
    extensions: {},
  };

  // Step 4: Submit with payment
  const result = await axios.post(
    `${VRF_URL}/v1/random/number`,
    { min, max },
    {
      headers: {
        "Content-Type": "application/json",
        "PAYMENT-SIGNATURE": Buffer.from(
          JSON.stringify(paymentPayload),
        ).toString("base64"),
      },
    },
  );

  return result.data;
}

// Usage
getRandomNumber(1, 100).then((result) => {
  console.log(`Random: ${result.number}`);
  console.log(`Operation: ${result.operation}`);
  console.log(`Seed: ${result.random_seed}`);
  console.log(`TEE: ${result.tee_type}`);
});
```

### cURL

```bash
# Random number with API key
curl -X POST https://vrf.mysterygift.fun/v1/random/number \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-secret-key" \
  -d '{"min": 1, "max": 100}'

# Response:
# {
#   "operation": "number",
#   "number": 42,
#   "min": 1,
#   "max": 100,
#   "random_seed": "a7f3c9d2e1b4f6c8a9e5d3b7c1f4e8a2d9b6c3f7e1a5d8b4c6f2e9a3d7b1c5f8",
#   "attestation": "eyJ0eXBl...",
#   "timestamp": 1704729600000,
#   "tee_type": "tdx"
# }

# Roll dice (e.g., 2d6 = two 6-sided dice)
curl -X POST https://vrf.mysterygift.fun/v1/random/dice \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-secret-key" \
  -d '{"dice": "2d6"}'

# Pick random winner from list
curl -X POST https://vrf.mysterygift.fun/v1/random/pick \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-secret-key" \
  -d '{"items": ["Alice", "Bob", "Charlie", "David"]}'

# Pick multiple winners
curl -X POST https://vrf.mysterygift.fun/v1/random/winners \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-secret-key" \
  -d '{"items": ["Alice", "Bob", "Charlie", "David", "Eve"], "count": 2}'

# Shuffle array
curl -X POST https://vrf.mysterygift.fun/v1/random/shuffle \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-secret-key" \
  -d '{"items": ["A", "B", "C", "D", "E"]}'

# Generate UUID
curl -X POST https://vrf.mysterygift.fun/v1/random/uuid \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-secret-key" \
  -d '{}'

# Generate random seed (256-bit)
curl -X POST https://vrf.mysterygift.fun/v1/randomness \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-secret-key" \
  -d '{}'

# Health check (no auth required)
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
