/**
 * x402 Payment Test Script for VRF Service
 *
 * Tests the x402 payment flow programmatically for both Base (EVM) and Solana networks.
 *
 * SUPPORTED NETWORKS:
 * - Base (EVM) - Uses EIP-3009 TransferWithAuthorization
 * - Solana - Uses SPL token transfer with facilitator fee payer
 *
 * Usage:
 *   # For Base (EVM):
 *   NETWORK=base PRIVATE_KEY=0xyour_private_key node test-x402-payment.js
 *
 *   # For Solana:
 *   NETWORK=solana PRIVATE_KEY=your_solana_base58_key node test-x402-payment.js
 *
 *   # Specify custom VRF URL:
 *   VRF_URL=https://vrf.mysterygift.fun NETWORK=base PRIVATE_KEY=0x... node test-x402-payment.js
 */

const { ethers } = require("ethers");
const {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
} = require("@solana/web3.js");
const {
  getAssociatedTokenAddress,
  createTransferCheckedInstruction,
} = require("@solana/spl-token");

const VRF_URL = process.env.VRF_URL || "https://vrf.mysterygift.fun";
const NETWORK = (process.env.NETWORK || "base").toLowerCase();
const PRIVATE_KEY = process.env.PRIVATE_KEY;

const USDC_ADDRESSES = {
  base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  solana: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
};

const HELIUS_RPC =
  "https://mainnet.helius-rpc.com/?api-key=a9b3f735-5075-44f3-a144-42e39e5f8827";

const SOLANA_DECIMALS = 6;

function validateEnv() {
  if (!PRIVATE_KEY) {
    console.error("Error: PRIVATE_KEY environment variable is required");
    console.log("\nUsage:");
    console.log("  # For Base (EVM):");
    console.log(
      "  NETWORK=base PRIVATE_KEY=0xyour_private_key node test-x402-payment.js",
    );
    console.log("\n  # For Solana:");
    console.log(
      "  NETWORK=solana PRIVATE_KEY=your_solana_base58_key node test-x402-payment.js",
    );
    console.log("\n  # With custom VRF URL:");
    console.log(
      "  VRF_URL=https://vrf.mysterygift.fun NETWORK=base PRIVATE_KEY=0x... node test-x402-payment.js",
    );
    process.exit(1);
  }

  if (!["base", "solana"].includes(NETWORK)) {
    console.error(
      `Error: NETWORK must be 'base' or 'solana', got '${NETWORK}'`,
    );
    process.exit(1);
  }
}

async function getProviderAndWallet() {
  if (NETWORK === "base") {
    const provider = new ethers.JsonRpcProvider("https://mainnet.base.org");
    let wallet;
    if (PRIVATE_KEY.startsWith("0x")) {
      wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    } else {
      wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    }
    return { provider, wallet, network: "base" };
  } else {
    // For Solana, use connection and Keypair
    const connection = new Connection(HELIUS_RPC);

    // Parse base58 private key
    const { Keypair } = require("@solana/web3.js");
    const bs58 = require("bs58");
    const privateKeyBytes = bs58.default.decode(PRIVATE_KEY);
    const keypair = Keypair.fromSecretKey(privateKeyBytes);

    return {
      provider: connection,
      wallet: keypair,
      network: "solana",
    };
  }
}

async function getPaymentRequirements() {
  console.log("\n📋 Step 1: Getting payment requirements...");

  const response = await fetch(`${VRF_URL}/v1/random/number`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ min: 1, max: 100 }),
  });

  console.log(`   HTTP Status: ${response.status}`);

  if (response.status !== 402) {
    throw new Error(`Expected 402 Payment Required, got ${response.status}`);
  }

  const paymentHeader = response.headers.get("payment-required");
  if (!paymentHeader) {
    throw new Error("No payment-required header found in response");
  }

  const paymentReq = JSON.parse(
    Buffer.from(paymentHeader, "base64").toString(),
  );

  console.log(`   Available networks:`);
  for (const accept of paymentReq.accepts) {
    console.log(
      `     - ${accept.network}: $${(parseInt(accept.amount) / 1000000).toFixed(2)} USDC to ${accept.payTo}`,
    );
  }

  return paymentReq;
}

function generateNonce() {
  const array = new Uint8Array(32);
  crypto.randomBytes(array);
  return (
    "0x" +
    Array.from(array)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}

async function buildBasePayment(paymentReq, wallet) {
  console.log("\n🔐 Step 2a: Building Base (EVM) payment payload...");

  const network = paymentReq.accepts.find((a) => a.network === "eip155:8453");
  if (!network) {
    throw new Error("No Base mainnet payment option available");
  }

  const chainId = 8453;
  const amount = network.amount;
  const usdcAddress = USDC_ADDRESSES.base;

  const domain = {
    name: "USD Coin",
    version: "2",
    chainId: chainId,
    verifyingContract: usdcAddress,
  };

  const validAfter = Math.floor(Date.now() / 1000);
  const validBefore = validAfter + 300;
  const nonce = generateNonce();

  const message = {
    from: wallet.address,
    to: network.payTo,
    value: amount,
    validAfter: validAfter.toString(),
    validBefore: validBefore.toString(),
    nonce: nonce,
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

  console.log(`   Wallet: ${wallet.address}`);
  console.log(`   Amount: $${parseInt(amount) / 10000} USDC`);

  const signature = await wallet.signTypedData(domain, types, message);
  console.log(`   Signature: ${signature.slice(0, 40)}...`);

  const payload = {
    x402Version: 2,
    resource: {
      url: `${VRF_URL}/v1/random/number`,
      description: "Random Number Generation",
      mimeType: "application/json",
    },
    accepted: {
      scheme: "exact",
      network: network.network,
      amount: amount,
      asset: network.asset,
      payTo: network.payTo,
      maxTimeoutSeconds: network.maxTimeoutSeconds,
    },
    payload: {
      signature: signature,
      authorization: {
        from: wallet.address,
        to: network.payTo,
        value: amount,
        validAfter: validAfter.toString(),
        validBefore: validBefore.toString(),
        nonce: nonce,
      },
    },
    extensions: {},
  };

  return payload;
}

async function buildSolanaPayment(paymentReq, connection, wallet) {
  console.log("\n🔐 Step 2b: Building Solana payment payload...");

  const network = paymentReq.accepts.find((a) =>
    a.network.startsWith("solana:"),
  );
  if (!network) {
    throw new Error("No Solana payment option available");
  }

  const feePayer = network.extra?.feePayer;
  if (!feePayer) {
    throw new Error("No feePayer provided in payment requirements");
  }

  const amount = BigInt(network.amount);
  const usdcMint = new PublicKey(network.asset);
  const paymentWallet = new PublicKey(network.payTo);
  const userPublicKey = wallet.publicKey;

  console.log(`   User Wallet: ${userPublicKey.toBase58()}`);
  console.log(`   Fee Payer (Facilitator): ${feePayer}`);
  console.log(
    `   Amount: $${(parseInt(network.amount) / 1000000).toFixed(2)} USDC`,
  );

  // Get user's USDC token account
  const userUsdcATA = await getAssociatedTokenAddress(usdcMint, userPublicKey);
  console.log(`   User USDC ATA: ${userUsdcATA.toBase58()}`);

  // Get payment wallet's USDC token account (ATA)
  const destUsdcATA = await getAssociatedTokenAddress(usdcMint, paymentWallet);
  console.log(`   Destination USDC ATA: ${destUsdcATA.toBase58()}`);

  // Get recent blockhash
  const { blockhash } = await connection.getLatestBlockhash();
  console.log(`   Blockhash: ${blockhash.slice(0, 20)}...`);

  // Build transaction
  const transaction = new Transaction();

  // Compute budget program ID
  const COMPUTE_BUDGET_ID = new PublicKey(
    "ComputeBudget111111111111111111111111111111",
  );

  // SetComputeUnitLimit: [0x02][4-byte LE units]
  const computeUnits = 20000;
  const computeLimitData = Buffer.alloc(5);
  computeLimitData[0] = 0x02;
  computeLimitData.writeUInt32LE(computeUnits, 1);

  transaction.add(
    new TransactionInstruction({
      keys: [],
      programId: COMPUTE_BUDGET_ID,
      data: computeLimitData,
    }),
  );

  // SetComputeUnitPrice: [0x03][8-byte LE microLamports]
  const microLamports = BigInt(1);
  const computePriceData = Buffer.alloc(9);
  computePriceData[0] = 0x03;
  computePriceData.writeBigUInt64LE(microLamports, 1);

  transaction.add(
    new TransactionInstruction({
      keys: [],
      programId: COMPUTE_BUDGET_ID,
      data: computePriceData,
    }),
  );

  // Add USDC transfer instruction
  transaction.add(
    createTransferCheckedInstruction(
      userUsdcATA,
      usdcMint,
      destUsdcATA,
      userPublicKey,
      amount,
      SOLANA_DECIMALS,
    ),
  );

  // Set facilitator as feePayer (required by x402)
  transaction.feePayer = new PublicKey(feePayer);
  transaction.recentBlockhash = blockhash;

  // Sign with user's wallet
  transaction.sign(wallet);

  // Serialize with requireAllSignatures: false (facilitator adds feePayer signature)
  const serialized = transaction.serialize({
    requireAllSignatures: false,
  });
  const base64Transaction = Buffer.from(serialized).toString("base64");

  console.log(`   Transaction size: ${serialized.length} bytes`);
  console.log(
    `   Signature: ${transaction.signatures[0]?.signature?.slice(0, 40)}...`,
  );

  const payload = {
    x402Version: 2,
    resource: {
      url: `${VRF_URL}/v1/random/number`,
      description: "Random Number Generation",
      mimeType: "application/json",
    },
    accepted: {
      scheme: "exact",
      network: network.network,
      amount: network.amount,
      asset: network.asset,
      payTo: network.payTo,
      maxTimeoutSeconds: network.maxTimeoutSeconds,
      extra: network.extra,
    },
    payload: {
      transaction: base64Transaction,
    },
    extensions: {},
  };

  return payload;
}

async function submitWithPayment(paymentPayload) {
  console.log("\n🚀 Step 3: Submitting request with payment...");

  const response = await fetch(`${VRF_URL}/v1/random/number`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "PAYMENT-SIGNATURE": Buffer.from(JSON.stringify(paymentPayload)).toString(
        "base64",
      ),
    },
    body: JSON.stringify({ min: 1, max: 100 }),
  });

  console.log(`   HTTP Status: ${response.status}`);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Request failed: ${response.status} - ${error}`);
  }

  const result = await response.json();
  return result;
}

async function main() {
  console.log(
    "================================================================================",
  );
  console.log("                    VRF x402 Payment Test Script");
  console.log(
    "================================================================================",
  );
  console.log(`VRF URL:  ${VRF_URL}`);
  console.log(`Network:  ${NETWORK.toUpperCase()}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);

  validateEnv();

  const { provider, wallet, network } = await getProviderAndWallet();

  if (NETWORK === "base") {
    console.log(`Wallet:   ${wallet.address}`);
  } else {
    console.log(`Wallet:   ${wallet.publicKey.toBase58()}`);
  }

  try {
    const paymentReq = await getPaymentRequirements();

    let paymentPayload;
    if (NETWORK === "base") {
      paymentPayload = await buildBasePayment(paymentReq, wallet);
    } else {
      paymentPayload = await buildSolanaPayment(paymentReq, provider, wallet);
    }

    const result = await submitWithPayment(paymentPayload);

    console.log("\n✅ Success! Random number generated:");
    console.log(`   Number:       ${result.number}`);
    console.log(`   Range:        ${result.min} - ${result.max}`);
    console.log(`   Random Seed:  ${result.random_seed.slice(0, 32)}...`);
    console.log(`   TEE Type:     ${result.tee_type}`);
    console.log(`   Timestamp:    ${new Date(result.timestamp).toISOString()}`);

    if (result.attestation) {
      try {
        const attest = JSON.parse(
          Buffer.from(result.attestation, "base64").toString(),
        );
        console.log("\n📜 Attestation:");
        console.log(`   Type:     ${attest.type}`);
        console.log(`   Provider: ${attest.provider}`);
        console.log(`   Algorithm: ${attest.algorithm}`);
      } catch (e) {
        console.log("   (Could not parse attestation)");
      }
    }

    console.log(
      "\n================================================================================",
    );
    console.log("                    Test PASSED - x402 Payment Working!");
    console.log(
      "================================================================================",
    );

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Test FAILED:", error.message);
    console.error("\nTroubleshooting:");
    console.error("  1. Ensure wallet has sufficient USDC balance");
    console.error("  2. For Base: Check network connectivity to base mainnet");
    console.error(
      "  3. Verify PRIVATE_KEY is correct (without 0x prefix for Solana)",
    );
    process.exit(1);
  }
}

main();
