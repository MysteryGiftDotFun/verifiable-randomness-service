# x402 v2 Payment Integration Guide

Complete documentation for integrating x402 v2 payments with Solana and Base networks using the official PayAI SDKs.

## Overview

The x402 v2 protocol enables pay-per-request APIs with on-chain payment verification. This service uses:

- **PayAI Hosted Facilitator** - Handles payment verification and transaction submission
- **Official x402 Schemes** - `@x402/evm/exact/server` and `@x402/svm/exact/server`
- **Browser-Compatible Client** - Manual instruction building for Solana (no Node.js dependencies)

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              PAYMENT FLOW                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. REQUEST           2. 402 RESPONSE         3. PAYMENT                    │
│  ┌─────────┐         ┌─────────────┐          ┌─────────────┐               │
│  │ Client  │ ──────► │ VRF Server  │ ───────► │   Client    │               │
│  │         │         │             │          │ (builds tx) │               │
│  └─────────┘         └─────────────┘          └──────┬──────┘               │
│                             │                         │                      │
│                             ▼                         ▼                      │
│                    Payment Requirements        Sign Transaction              │
│                    - network                           │                      │
│                    - asset                            │                      │
│                    - amount                           │                      │
│                    - payTo                            │                      │
│                    - extra.feePayer                   │                      │
│                                                      │                      │
│  4. RETRY WITH PAYMENT                               │                      │
│  ┌─────────┐         ┌─────────────┐                 │                      │
│  │ Client  │ ──────► │ VRF Server  │ ◄───────────────┘                      │
│  └─────────┘         └──────┬──────┘                                        │
│                             │                                               │
│                             ▼                                               │
│                    ┌─────────────────┐                                      │
│                    │ PayAI Facilitator│                                     │
│                    │ (verifies tx)   │                                      │
│                    └────────┬────────┘                                      │
│                             │                                               │
│                             ▼                                               │
│                    ┌─────────────────┐                                      │
│                    │  Randomness +   │                                      │
│                    │  Attestation    │                                      │
│                    └─────────────────┘                                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Server-Side Setup

### Package Installation

```bash
pnpm add @x402/express @x402/core @x402/evm @x402/svm @payai/facilitator
```

### Server Implementation

```typescript
import { paymentMiddleware } from "@x402/express";
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { ExactSvmScheme } from "@x402/svm/exact/server";
import { facilitator } from "@payai/facilitator";

// Initialize facilitator client with PayAI's hosted service
const facilitatorClient = new HTTPFacilitatorClient(facilitator);

// Create x402 resource server
const x402Server = new x402ResourceServer(facilitatorClient);

// Register schemes for each supported network
x402Server
  .register("eip155:8453", new ExactEvmScheme()) // Base mainnet
  .register("eip155:84532", new ExactEvmScheme()) // Base Sepolia
  .register("solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp", new ExactSvmScheme()) // Solana mainnet
  .register("solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1", new ExactSvmScheme()); // Solana devnet

// Apply payment middleware
app.use(
  paymentMiddleware(
    {
      "POST /v1/randomness": {
        accepts: [
          {
            scheme: "exact",
            price: "$0.01",
            network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
            payTo: PAYMENT_WALLET,
          },
          {
            scheme: "exact",
            price: "$0.01",
            network: "eip155:8453",
            payTo: PAYMENT_WALLET_BASE,
          },
        ],
        description: "TEE Randomness Request",
        mimeType: "application/json",
      },
    },
    x402Server,
  ),
);
```

### Network IDs

| Network        | Chain ID / Network ID                     |
| -------------- | ----------------------------------------- |
| Base Mainnet   | `eip155:8453`                             |
| Base Sepolia   | `eip155:84532`                            |
| Solana Mainnet | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` |
| Solana Devnet  | `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` |

### Why `@x402/*` and not `@payai/x402-*`?

- `@x402/evm/exact/server` and `@x402/svm/exact/server` - **Merchant-side schemes** for use with PayAI's hosted facilitator
- `@payai/x402-evm` and `@payai/x402-svm` - **Self-hosted facilitator** schemes (not needed when using PayAI hosted)

## Client-Side Implementation

### Solana Payments

Solana requires manual transaction building for browser compatibility. The `ComputeBudgetProgram` from `@solana/web3.js` uses Node.js Buffer internally.

#### Required RPC Calls

The client needs RPC for:

1. `getLatestBlockhash()` - Recent blockhash for transaction validity
2. `getAccountInfo()` - Verify USDC token account exists

**Note:** These are client-side calls only. The server never makes RPC calls.

#### Transaction Building

```javascript
async function createSolanaPayment(paymentReq, body) {
  const { Connection, PublicKey, Transaction, TransactionInstruction } =
    solanaWeb3;

  const walletPublicKey = new PublicKey(wallet);
  const usdcMint = new PublicKey(paymentReq.asset);
  const paymentWallet = new PublicKey(paymentReq.payTo);

  // Get sender's token account
  const senderATA = await splToken.getAssociatedTokenAddress(
    usdcMint,
    walletPublicKey,
  );

  // CRITICAL: Destination must be ATA, not wallet address
  const destATA = await splToken.getAssociatedTokenAddress(
    usdcMint,
    paymentWallet,
  );

  // Build transfer instruction
  const amount = BigInt(paymentReq.amount);
  const transferIx = splToken.createTransferCheckedInstruction(
    senderATA,
    usdcMint,
    destATA,
    walletPublicKey,
    amount,
    6, // USDC decimals
  );

  // CRITICAL: Use facilitator's feePayer, not user's wallet
  const facilitatorFeePayer = paymentReq.extra?.feePayer;
  if (!facilitatorFeePayer) {
    throw new Error("No feePayer provided in payment requirements");
  }

  // CRITICAL: Compute budget instructions must be first
  // Manual construction for browser compatibility
  const COMPUTE_BUDGET_PROGRAM_ID = new PublicKey(
    "ComputeBudget111111111111111111111111111111",
  );

  // SetComputeUnitLimit: [0x02][4-byte LE units]
  const computeUnits = 20000; // Max 60000
  const computeLimitData = new Uint8Array(5);
  computeLimitData[0] = 0x02;
  computeLimitData[1] = computeUnits & 0xff;
  computeLimitData[2] = (computeUnits >> 8) & 0xff;
  computeLimitData[3] = (computeUnits >> 16) & 0xff;
  computeLimitData[4] = (computeUnits >> 24) & 0xff;

  // SetComputeUnitPrice: [0x03][8-byte LE microLamports]
  const microLamports = BigInt(1); // Max 5
  const computePriceData = new Uint8Array(9);
  computePriceData[0] = 0x03;
  for (let i = 0; i < 8; i++) {
    computePriceData[1 + i] = Number(
      (microLamports >> BigInt(i * 8)) & BigInt(0xff),
    );
  }

  const transaction = new Transaction()
    .add(
      new TransactionInstruction({
        keys: [],
        programId: COMPUTE_BUDGET_PROGRAM_ID,
        data: computeLimitData,
      }),
    )
    .add(
      new TransactionInstruction({
        keys: [],
        programId: COMPUTE_BUDGET_PROGRAM_ID,
        data: computePriceData,
      }),
    )
    .add(transferIx);

  // Set facilitator as feePayer
  transaction.feePayer = new PublicKey(facilitatorFeePayer);
  transaction.recentBlockhash = (
    await connection.getLatestBlockhash()
  ).blockhash;

  // Sign with wallet - only user signature, facilitator adds feePayer signature
  const signedTx = await window.solana.signTransaction(transaction);

  // CRITICAL: requireAllSignatures: false allows missing feePayer signature
  const serialized = signedTx.serialize({
    requireAllSignatures: false,
  });
  const base64 = btoa(String.fromCharCode(...new Uint8Array(serialized)));

  return {
    x402Version: 2,
    resource: {
      url: window.location.origin + "/v1/randomness",
      description: "TEE Randomness Request",
      mimeType: "application/json",
    },
    accepted: {
      scheme: "exact",
      network: paymentReq.network,
      amount: paymentReq.amount,
      asset: paymentReq.asset,
      payTo: paymentReq.payTo,
      maxTimeoutSeconds: paymentReq.maxTimeoutSeconds,
      extra: paymentReq.extra,
    },
    payload: {
      transaction: base64,
    },
  };
}
```

### Base/EVM Payments

EVM payments use EIP-3009 `TransferWithAuthorization` with MetaMask's `eth_signTypedData_v4`.

#### No RPC Required

MetaMask handles everything internally - no RPC calls needed for Base payments.

#### Implementation

```javascript
const X402EVM = {
  USDC_ADDRESSES: {
    base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "base-sepolia": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  },

  generateNonce() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return (
      "0x" +
      Array.from(array)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
    );
  },

  buildTypedData(
    from,
    to,
    value,
    validAfter,
    validBefore,
    nonce,
    chainId,
    usdcAddress,
  ) {
    return {
      domain: {
        name: "USD Coin",
        version: "2",
        chainId: chainId,
        verifyingContract: usdcAddress,
      },
      message: {
        from: from,
        to: to,
        value: value.toString(),
        validAfter: validAfter.toString(),
        validBefore: validBefore.toString(),
        nonce: nonce,
      },
      primaryType: "TransferWithAuthorization",
      types: {
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
      },
    };
  },

  async createPaymentPayload(provider, network, paymentRequirements) {
    const { amount, asset, payTo, maxTimeoutSeconds, extra } =
      paymentRequirements;
    const from = wallet;

    const validAfter = Math.floor(Date.now() / 1000);
    const validBefore = validAfter + 300;
    const nonce = this.generateNonce();
    const chainId = parseInt(network.split(":")[1] || "8453", 10);

    const typedData = this.buildTypedData(
      from,
      payTo,
      amount,
      validAfter,
      validBefore,
      nonce,
      chainId,
      asset,
    );

    const signature = await provider.request({
      method: "eth_signTypedData_v4",
      params: [from, JSON.stringify(typedData)],
    });

    return {
      x402Version: 2,
      resource: {
        url: window.location.origin + "/v1/randomness",
        description: "TEE Randomness Request",
        mimeType: "application/json",
      },
      accepted: {
        scheme: "exact",
        network: network,
        amount: amount,
        asset: asset,
        payTo: payTo,
        maxTimeoutSeconds: maxTimeoutSeconds,
        extra: extra,
      },
      payload: {
        signature: signature,
        authorization: {
          from: from,
          to: payTo,
          value: amount,
          validAfter: validAfter.toString(),
          validBefore: validBefore.toString(),
          nonce: nonce,
        },
      },
      extensions: {}, // REQUIRED: empty object per x402 spec
    };
  },
};
```

## Payment Payload Format (x402 v2)

```typescript
interface X402PaymentPayload {
  x402Version: 2;
  resource: {
    url: string;
    description: string;
    mimeType: string;
  };
  accepted: {
    scheme: "exact";
    network: string;
    amount: string;
    asset: string;
    payTo: string;
    maxTimeoutSeconds: number;
    extra?: {
      feePayer?: string; // Solana only - facilitator's feePayer address
    };
  };
  payload: {
    // Solana
    transaction?: string; // Base64-encoded partially-signed transaction
    // EVM
    signature?: string;
    authorization?: {
      from: string;
      to: string;
      value: string;
      validAfter: string;
      validBefore: string;
      nonce: string;
    };
  };
  extensions: {}; // REQUIRED: must be empty object
}
```

## Key Implementation Details

### Solana-Specific

| Aspect         | Requirement                          | Reason                            |
| -------------- | ------------------------------------ | --------------------------------- |
| feePayer       | Must be `extra.feePayer` from server | Facilitator pays transaction fees |
| Compute Budget | Must be first 2 instructions         | Required by x402-svm              |
| Compute Units  | Max 60,000                           | Protocol limit                    |
| MicroLamports  | Max 5                                | Protocol limit                    |
| Destination    | Must be ATA, not wallet              | SPL token transfer requirement    |
| Serialization  | `requireAllSignatures: false`        | Allows missing feePayer signature |

### Base/EVM-Specific

| Aspect           | Requirement                        | Reason                     |
| ---------------- | ---------------------------------- | -------------------------- |
| Signature Method | `eth_signTypedData_v4`             | EIP-712 typed data signing |
| Authorization    | EIP-3009 TransferWithAuthorization | Gasless USDC transfer      |
| Valid Window     | 300 seconds typical                | Prevents replay attacks    |
| Nonce            | 32 random bytes                    | Unique per authorization   |

## RPC Requirements Summary

| Component                          | RPC Required | Why                                                  |
| ---------------------------------- | ------------ | ---------------------------------------------------- |
| **Server (payment verification)**  | No           | PayAI facilitator handles on-chain verification      |
| **Server (randomness generation)** | No           | Uses `crypto.randomBytes(32)`                        |
| **Client (Solana payments)**       | Yes          | Build unsigned transaction (blockhash, account info) |
| **Client (Base payments)**         | No           | MetaMask handles everything                          |

## Testing

### Local Development

```bash
# Start server
cd services/verifiable-randomness-service/worker
pnpm dev

# Open landing page
open http://localhost:3000
```

### Production

1. Visit the deployed landing page
2. Connect wallet (Phantom for Solana, MetaMask for Base)
3. Select network
4. Click "Generate Randomness"
5. Approve transaction in wallet
6. View result with attestation

## Troubleshooting

### "No feePayer provided in payment requirements"

The server's payment requirements must include `extra.feePayer` for Solana payments. Ensure the payment middleware is configured correctly.

### "Transaction simulation failed"

Check:

1. User has USDC balance
2. Correct USDC mint address for network
3. Valid blockhash (not expired)

### "Signature verification failed"

For EVM:

1. Ensure `eth_signTypedData_v4` is used (not `personal_sign`)
2. Check chain ID matches network
3. Verify USDC contract address

### "Invalid compute budget"

For Solana:

1. Compute units must be ≤ 60,000
2. MicroLamports must be ≤ 5
3. Instructions must be first in transaction

## References

- [x402 Protocol Spec](https://github.com/ArthurF-x402/x402)
- [PayAI Facilitator](https://facilitator.payai.network)
- [EIP-3009: TransferWithAuthorization](https://eips.ethereum.org/EIPS/eip-3009)
- [Solana Compute Budget](https://docs.solanalabs.com/proposals/compute-budget)
