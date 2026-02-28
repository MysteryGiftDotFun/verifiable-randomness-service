# VRF Service x402 Payment Testing Guide

This guide documents how to test the Verifiable Randomness Service (VRF) using the x402 payment protocol programmatically.

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Test Script Usage](#test-script-usage)
4. [Manual Testing with cURL](#manual-testing-with-curl)
5. [Testing via Browser UI](#testing-via-browser-ui)
6. [Troubleshooting](#troubleshooting)

---

## Overview

The VRF service requires payment via x402 protocol for all API requests. The service accepts payments on two networks:

| Network | Chain ID                                  | USDC Address                                   | Payment Wallet                                 |
| ------- | ----------------------------------------- | ---------------------------------------------- | ---------------------------------------------- |
| Base    | `eip155:8453`                             | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`   | `0x2d55488AD8dd2671c2F8D08FAad75908afa461c3`   |
| Solana  | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` | `3Qudd5FG8foyFnbKxwfkDktnuushG7CDHBMSNk9owAjx` |

**Price**: $0.01 USD per request (10,000 USDC units)

---

## Prerequisites

### 1. Wallet with USDC

You need a wallet with USDC balance on either:

- **Base Mainnet** - For Base (EVM) payments
- **Solana Mainnet** - For Solana payments

### 2. Private Key

Export your wallet's private key:

- **MetaMask (Base)**: Export private key from account details
- **Phantom (Solana)**: Export secret recovery phrase

### 3. Node.js Dependencies

The test script is located at:

```
services/verifiable-randomness-service/worker/test-x402-payment.cjs
```

Required dependencies are already installed in the worker package.

---

## Test Script Usage

### Running the Test Script

```bash
cd services/verifiable-randomness-service/worker
```

#### Base (EVM) Test

```bash
NETWORK=base PRIVATE_KEY=0xyour_base_private_key node test-x402-payment.cjs
```

Example:

```bash
NETWORK=base PRIVATE_KEY=0x1234567890abcdef... node test-x402-payment.cjs
```

#### Solana Test

```bash
NETWORK=solana PRIVATE_KEY=your_solana_base58_key node test-x402-payment.cjs
```

Note: Solana test requires additional setup with Solana web3.js. See [Solana Payment](#solana-payments) section.

### Environment Variables

| Variable      | Required | Description                                                   |
| ------------- | -------- | ------------------------------------------------------------- |
| `PRIVATE_KEY` | Yes      | Wallet private key (0x prefix for Base, no prefix for Solana) |
| `NETWORK`     | No       | `base` or `solana` (default: `base`)                          |
| `VRF_URL`     | No       | VRF service URL (default: `https://vrf.mysterygift.fun`)      |

### Expected Output

```
================================================================================
                    VRF x402 Payment Test Script
================================================================================
VRF URL:  https://vrf.mysterygift.fun
Network:  BASE
Timestamp: 2026-02-28T16:43:18.196Z
Wallet:   0xYourWalletAddress

📋 Step 1: Getting payment requirements...
   HTTP Status: 402
   Available networks:
     - solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp: $0.01 USDC to 3Qudd5FG8foyFnbKxwfkDktnuushG7CDHBMSNk9owAjx
     - eip155:8453: $0.01 USDC to 0x2d55488AD8dd2671c2F8D08FAad75908afa461c3

🔐 Step 2a: Building Base (EVM) payment payload...
   Wallet: 0xYourWalletAddress
   Amount: $0.01 USDC
   Signature: 0xabc123...

🚀 Step 3: Submitting request with payment...
   HTTP Status: 200

✅ Success! Random number generated:
   Number:       42
   Range:       1 - 100
   Random Seed: a7f3c9d2e1b4f6c8a9e5d3b7c1f4e8a2...
   TEE Type:    tdx
   Timestamp:   2026-02-28T16:43:20.000Z

📜 Attestation:
   Type:     tdx-attestation
   Provider: phala-dstack
   Algorithm: sha256

================================================================================
                    Test PASSED - x402 Payment Working!
================================================================================
```

---

## Manual Testing with cURL

### Step 1: Request Without Payment

```bash
curl -s -i -X POST https://vrf.mysterygift.fun/v1/random/number \
  -H "Content-Type: application/json" \
  -d '{"min": 1, "max": 100}'
```

Expected response: `HTTP/2 402` with `payment-required` header.

### Step 2: Decode Payment Requirements

```bash
# Extract and decode payment-required header
PAYMENT_HEADER=$(curl -s -i -X POST https://vrf.mysterygift.fun/v1/random/number \
  -H "Content-Type: application/json" \
  -d '{"min": 1, "max": 100}' 2>&1 | grep -i "payment-required:" | cut -d' ' -f2- | tr -d '\r')

echo "$PAYMENT_HEADER" | base64 -d | jq .
```

This returns:

```json
{
  "x402Version": 2,
  "error": "Payment required",
  "resource": {
    "url": "https://vrf.mysterygift.fun/v1/random/number",
    "description": "Random Number Generation",
    "mimeType": "application/json"
  },
  "accepts": [
    {
      "scheme": "exact",
      "network": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
      "amount": "10000",
      "asset": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "payTo": "3Qudd5FG8foyFnbKxwfkDktnuushG7CDHBMSNk9owAjx",
      "maxTimeoutSeconds": 300,
      "extra": {
        "feePayer": "2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4"
      }
    },
    {
      "scheme": "exact",
      "network": "eip155:8453",
      "amount": "10000",
      "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      "payTo": "0x2d55488AD8dd2671c2F8D08FAad75908afa461c3",
      "maxTimeoutSeconds": 300
    }
  ]
}
```

### Step 3: Build Payment Payload

**For Base (EVM)**:

Use the test script or build manually with ethers.js:

```javascript
const { ethers } = require("ethers");

const wallet = new ethers.Wallet(
  "0xyour_private_key",
  new ethers.JsonRpcProvider("https://mainnet.base.org"),
);

const domain = {
  name: "USD Coin",
  version: "2",
  chainId: 8453,
  verifyingContract: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
};

const message = {
  from: wallet.address,
  to: "0x2d55488AD8dd2671c2F8D08FAad75908afa461c3",
  value: "10000",
  validAfter: Math.floor(Date.now() / 1000).toString(),
  validBefore: (Math.floor(Date.now() / 1000) + 300).toString(),
  nonce: "0x" + crypto.randomBytes(32).toString("hex"),
};

const types = {
  EIP712Domain: [
    { name: "name", type: "string" },
    { name: "version", type: "string" },
    { name: "chainId", type: "uint256" },
    { name: "verifyingContract", type: "address" },
  ],
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
};

const signature = await wallet.signTypedData(domain, types, message);

// Build payment payload
const paymentPayload = {
  x402Version: 2,
  resource: {
    url: "https://vrf.mysterygift.fun/v1/random/number",
    description: "Random Number Generation",
    mimeType: "application/json",
  },
  accepted: {
    scheme: "exact",
    network: "eip155:8453",
    amount: "10000",
    asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    payTo: "0x2d55488AD8dd2671c2F8D08FAad75908afa461c3",
    maxTimeoutSeconds: 300,
  },
  payload: {
    signature: signature,
    authorization: {
      from: wallet.address,
      to: "0x2d55488AD8dd2671c2F8D08FAad75908afa461c3",
      value: "10000",
      validAfter: message.validAfter,
      validBefore: message.validBefore,
      nonce: message.nonce,
    },
  },
  extensions: {},
};
```

### Step 4: Submit with Payment

```bash
curl -s -X POST https://vrf.mysterygift.fun/v1/random/number \
  -H "Content-Type: application/json" \
  -H "PAYMENT-SIGNATURE: $(echo $PAYLOAD_JSON | base64 -w0)" \
  -d '{"min": 1, "max": 100}'
```

---

## Testing via Browser UI

The easiest way to test is via the browser UI:

1. Visit: `https://vrf.mysterygift.fun`
2. Click "Connect Wallet"
   - For Base: Use MetaMask
   - For Solana: Use Phantom
3. Select network (Base or Solana)
4. Click "Generate Randomness"
5. Approve the transaction in your wallet

The UI will display:

- Random seed
- TEE attestation
- Verification status

---

## Available Endpoints

All endpoints require x402 payment:

| Endpoint                  | Description                  |
| ------------------------- | ---------------------------- |
| `POST /v1/randomness`     | Generate 256-bit random seed |
| `POST /v1/random/number`  | Random integer in range      |
| `POST /v1/random/pick`    | Pick random item from array  |
| `POST /v1/random/shuffle` | Shuffle array (Fisher-Yates) |
| `POST /v1/random/winners` | Pick multiple winners        |
| `POST /v1/random/uuid`    | Generate UUIDv4              |
| `POST /v1/random/dice`    | Roll dice (e.g., "2d6")      |

### Health Check (No Payment Required)

```bash
curl https://vrf.mysterygift.fun/v1/health
```

---

## Troubleshooting

### "Insufficient USDC balance"

Ensure your wallet has at least $0.01 USDC on the selected network.

### "Payment required" despite valid payment

1. Check payment payload format matches x402 v2 spec
2. Ensure `PAYMENT-SIGNATURE` header is base64-encoded JSON
3. Verify signature is not expired (300 second window)

### "Module not found: ethers"

The script must be run from the worker directory:

```bash
cd services/verifiable-randomness-service/worker
node test-x402-payment.cjs
```

### Network Errors

- **Base**: Ensure you're connected to Base mainnet (not testnet)
- **Solana**: Ensure you're connected to Solana mainnet (not devnet)

### Rate Limiting

- 100 requests/minute per IP (global)
- 20 requests/minute for paid endpoints

---

## References

- [x402 Protocol Specification](https://x402.org)
- [EIP-3009: TransferWithAuthorization](https://eips.ethereum.org/EIPS/eip-3009)
- [PayAI Facilitator](https://facilitator.payai.network)
- [VRF API Documentation](./API.md)
- [x402 Integration Guide](./X402-INTEGRATION.md)
