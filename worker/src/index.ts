import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import cors from "cors";
import path from "path";
import fs from "fs";
import { DstackClient } from "@phala/dstack-sdk";
import { Keypair } from "@solana/web3.js";
import {
  commitToArweave,
  computeCommitmentHash,
  ArweaveCommitmentResult,
} from "./commitment";
import { LRUCache } from "lru-cache";
import Redis from "ioredis";
import rateLimit from "express-rate-limit";
import { X402Server } from "x402";
import type { PaymentRequirements, PaymentPayload } from "x402";
import { renderLandingPage } from "./landing";

const app = express();

app.use(express.json());

// Strict CORS configuration
app.use(
  cors({
    origin:
      process.env.NODE_ENV === "production"
        ? [
            "https://mysterygift.fun",
            "https://vrf.mysterygift.fun",
            /\.mysterygift\.fun$/,
          ]
        : [
            "http://localhost:3000",
            "http://localhost:5173",
            "http://localhost:5174",
          ],
    credentials: true,
    optionsSuccessStatus: 200,
  }),
);

const PORT = parseInt(process.env.PORT || "3000", 10);

// Configuration
const PRICE_PER_REQUEST_CENTS = 1; // $0.01 per attestation
const API_KEYS = (process.env.API_KEYS || "").split(",").filter(Boolean);

const PAYMENT_WALLET = (() => {
  const wallet = process.env.PAYMENT_WALLET;
  const environment =
    process.env.ENVIRONMENT || process.env.NODE_ENV || "development";
  if (!wallet) {
    if (environment === "production") {
      throw new Error("CRITICAL: PAYMENT_WALLET must be set in production");
    }
    console.warn("[Config] PAYMENT_WALLET not set, using default dev wallet");
    return "3Qudd5FG8foyFnbKxwfkDktnuushG7CDHBMSNk9owAjx";
  }
  return wallet;
})();

const PAYMENT_WALLET_BASE = process.env.PAYMENT_WALLET_BASE || PAYMENT_WALLET;

// Load version from package.json
const packageJson = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../package.json"), "utf-8"),
);
const VERSION = packageJson.version;

// x402 Facilitator Configuration
const X402_FACILITATOR_URL =
  process.env.X402_FACILITATOR_URL || "https://facilitator.payai.network";
const SUPPORTED_NETWORKS = (process.env.SUPPORTED_NETWORKS || "solana")
  .split(",")
  .map((n) => n.trim())
  .filter(Boolean);

// USDC mint addresses per network
const USDC_ASSETS: Record<string, string> = {
  solana: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
};

// USDC has 6 decimals; $0.01 = 10000 base units
const PRICE_BASE_UNITS = "10000";

const x402Server = new X402Server({
  facilitatorUrl: X402_FACILITATOR_URL,
});

// Facilitator fee payer for Solana networks (from https://facilitator.payai.network/supported)
const SOLANA_FEE_PAYER = "2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4";

// Build PaymentRequirements for each supported network
const paymentRequirementsByNetwork: Record<string, PaymentRequirements> = {};
for (const network of SUPPORTED_NETWORKS) {
  const paymentWallet =
    network === "base" ? PAYMENT_WALLET_BASE : PAYMENT_WALLET;
  paymentRequirementsByNetwork[network] = X402Server.buildPaymentRequirements({
    network,
    maxAmountRequired: PRICE_BASE_UNITS,
    asset: USDC_ASSETS[network] || USDC_ASSETS.solana,
    payTo: paymentWallet,
    resource: `https://vrf.mysterygift.fun/v1/randomness`,
    description: "TEE Randomness Request",
    maxTimeoutSeconds: 60,
    // Include facilitator's fee payer for Solana networks
    extra: network.includes("solana")
      ? { feePayer: SOLANA_FEE_PAYER }
      : undefined,
  });
}

// TEE deployment info
let TEE_INFO: {
  app_id: string;
  compose_hash: string;
  instance_id: string;
} = {
  app_id:
    process.env.PHALA_APP_ID || "4379c582b5c9cf28473de17932e9d62b4eb15995",
  compose_hash: "",
  instance_id: "",
};

// Arweave immutable proof configuration
const ARWEAVE_ENABLED = process.env.ARWEAVE_ENABLED !== "false"; // Enabled by default

// TEE-derived commitment keypair (for Arweave uploads via Turbo SDK)
let commitmentKeypair: Keypair | null = null;

/**
 * Derives a deterministic keypair from TEE hardware for signing Arweave data items.
 * Same pattern as verifiable-wallet-service's getVaultKey().
 */
async function getCommitmentKeypair(): Promise<Keypair | null> {
  if (commitmentKeypair) return commitmentKeypair;

  try {
    const dstack = getDstackClient();
    if (!dstack) throw new Error("dStack client not initialized");

    const keyResponse = await dstack.getKey(
      "/",
      "mystery-gift-rng-commitment-v1",
    );
    const seed = keyResponse.key.subarray(0, 32);
    commitmentKeypair = Keypair.fromSeed(seed);
    console.log(
      `[TEE] Commitment keypair derived: ${commitmentKeypair.publicKey.toBase58()}`,
    );
    return commitmentKeypair;
  } catch (e) {
    if (process.env.NODE_ENV === "production") {
      console.error(
        "[TEE] Failed to derive commitment keypair in production:",
        e,
      );
      return null;
    }

    console.warn(
      "[TEE] Commitment keypair derivation failed (simulation mode), using fallback",
    );
    const fallbackSeed = new Uint8Array(32).fill(7); // Deterministic fallback for dev
    commitmentKeypair = Keypair.fromSeed(fallbackSeed);
    console.log(
      `[TEE] Dev commitment keypair: ${commitmentKeypair.publicKey.toBase58()}`,
    );
    return commitmentKeypair;
  }
}

/**
 * Upload immutable proof to Arweave.
 * Non-blocking: if it fails, we still return the randomness result.
 */
async function runCommitments(
  seed: string,
  requestHash: string,
  attestation: string,
  endpoint: string,
  metadata?: Record<string, any>,
): Promise<{
  commitment_hash: string;
  arweave_tx: string | null;
  arweave_url: string | null;
} | null> {
  if (!ARWEAVE_ENABLED) return null;

  const keypair = await getCommitmentKeypair();
  if (!keypair) {
    console.warn(
      "[TEE] Commitment keypair unavailable, skipping Arweave upload",
    );
    return null;
  }

  const commitmentHash = computeCommitmentHash(seed, requestHash);
  const appId = TEE_INFO.app_id;

  try {
    const arweaveResult = await commitToArweave(
      seed,
      attestation,
      requestHash,
      endpoint,
      appId,
      keypair,
      metadata,
    );

    return {
      commitment_hash: commitmentHash,
      arweave_tx: arweaveResult.arweave_tx_id,
      arweave_url: arweaveResult.arweave_url,
    };
  } catch (e) {
    console.warn("[TEE] Arweave commitment failed:", e);
    return {
      commitment_hash: commitmentHash,
      arweave_tx: null,
      arweave_url: null,
    };
  }
}

// Redis client for persistent replay protection
let redis: Redis | null = null;
let redisAvailable = false;

function initRedis(): void {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.warn(
      "[TEE] REDIS_URL not set, using in-memory LRU cache (replay protection resets on restart)",
    );
    return;
  }

  redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      if (times > 10) return null; // Stop retrying after 10 attempts
      return Math.min(times * 200, 5000);
    },
    lazyConnect: true,
  });

  redis.on("connect", () => {
    redisAvailable = true;
    console.log("[TEE] Redis connected — replay protection is persistent");
  });

  redis.on("error", (err) => {
    if (redisAvailable) {
      console.error(
        "[TEE] Redis error, falling back to in-memory LRU:",
        err.message,
      );
    }
    redisAvailable = false;
  });

  redis.on("close", () => {
    redisAvailable = false;
    console.warn(
      "[TEE] Redis connection closed, falling back to in-memory LRU",
    );
  });

  redis.connect().catch((err) => {
    console.warn(
      "[TEE] Redis initial connection failed, using in-memory LRU:",
      err.message,
    );
  });
}

initRedis();

// In-memory LRU fallback when Redis is unavailable
const usedPayloadHashes = new LRUCache<string, boolean>({
  max: 10000,
  ttl: 3600000, // 1 hour TTL
  ttlAutopurge: true,
});

// Replay protection helpers
async function hasPayloadHash(hash: string): Promise<boolean> {
  if (redisAvailable && redis) {
    try {
      const exists = await redis.exists(`replay:${hash}`);
      return exists === 1;
    } catch {
      // Redis failed, fall through to LRU
    }
  }
  return usedPayloadHashes.has(hash);
}

async function addPayloadHash(hash: string): Promise<void> {
  if (redisAvailable && redis) {
    try {
      // Permanent storage — no expiry, survives restarts
      await redis.set(`replay:${hash}`, "1");
    } catch {
      // Redis failed, fall through to LRU
    }
  }
  // Always write to LRU as backup
  usedPayloadHashes.set(hash, true);
}

async function removePayloadHash(hash: string): Promise<void> {
  if (redisAvailable && redis) {
    try {
      await redis.del(`replay:${hash}`);
    } catch {
      // Redis failed, fall through to LRU
    }
  }
  usedPayloadHashes.delete(hash);
}

// Log cache stats periodically
setInterval(() => {
  const redisStatus = redisAvailable ? "connected" : "disconnected";
  console.log(
    `[TEE] Replay protection: redis=${redisStatus}, lru_fallback=${usedPayloadHashes.size}/${usedPayloadHashes.max}`,
  );
}, 3600000);

// Log payment configuration on startup
console.log(`[TEE] x402 facilitator: ${X402_FACILITATOR_URL}`);
console.log(`[TEE] Supported networks: ${SUPPORTED_NETWORKS.join(", ")}`);

// dStack Client for Attestation
let client: DstackClient | null = null;

function getDstackClient(): DstackClient | null {
  if (client) return client;
  try {
    client = new DstackClient();
    TEE_TYPE = "tdx";
    console.log("[TEE] dStack client initialized successfully");
    return client;
  } catch (e) {
    // Check silently, will retry next time
    return null;
  }
}

// Initialize on startup if possible
getDstackClient();
if (!client) {
  console.log(
    "[TEE] dStack socket not found, client disabled (simulation mode)",
  );
}

let TEE_TYPE = "simulation";

// Usage tracking (in-memory for now, use Redis/DB in production)
const usageStats = {
  totalRequests: 0,
  paidRequests: 0,
  apiKeyRequests: 0,
  totalRevenueCents: 0,
};

// Rate limiters
const globalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute per IP
  message: { error: "Too many requests, please slow down" },
  standardHeaders: true,
  legacyHeaders: false,
});

const paidLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20, // 20 paid requests per minute
  keyGenerator: (req) => {
    // Rate limit by payment payload hash OR IP
    const paymentHeader = req.get("X-Payment");
    if (paymentHeader) {
      return crypto
        .createHash("sha256")
        .update(paymentHeader)
        .digest("hex")
        .slice(0, 16);
    }
    return req.ip || "unknown";
  },
  message: { error: "Rate limit exceeded for paid requests" },
});

// Apply global rate limiter to all /v1/ routes
app.use("/v1/", globalLimiter);

/**
 * Middleware: Check authentication and x402 payment
 *
 * x402 protocol flow:
 * 1. No X-PAYMENT header → 402 with PaymentRequirements in `accepts`
 * 2. X-PAYMENT header present → decode, verify via facilitator, run handler, settle
 */
async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.get("X-API-Key") || req.query.api_key;

  // 1. Check API key (free access for authorized partners)
  if (apiKey && API_KEYS.includes(apiKey as string)) {
    usageStats.apiKeyRequests++;
    (req as any).paymentStatus = "api_key";
    return next();
  }

  // 2. Check x402 X-PAYMENT header
  const paymentHeader = req.get("X-Payment");

  if (!paymentHeader) {
    // Return standard 402 with PaymentRequirements
    const accepts = Object.values(paymentRequirementsByNetwork);
    res.status(402).json({
      x402Version: 1,
      error: "X-PAYMENT header is required",
      accepts,
    });
    return;
  }

  // 4. Decode and verify x402 payment
  try {
    const paymentPayload = X402Server.decodePaymentHeader(paymentHeader);

    if (!paymentPayload) {
      res.status(402).json({
        x402Version: 1,
        error: "Invalid X-PAYMENT header format",
        accepts: Object.values(paymentRequirementsByNetwork),
      });
      return;
    }

    // Replay protection: hash the payload
    const payloadHash = crypto
      .createHash("sha256")
      .update(paymentHeader)
      .digest("hex");
    if (await hasPayloadHash(payloadHash)) {
      console.warn(
        `[TEE] Replay attempt detected: ${payloadHash.slice(0, 16)}`,
      );
      res.status(402).json({
        x402Version: 1,
        error: "Payment payload already used (replay detected)",
      });
      return;
    }
    await addPayloadHash(payloadHash);

    // Find matching payment requirements for the network
    const requirements = paymentRequirementsByNetwork[paymentPayload.network];
    if (!requirements) {
      await removePayloadHash(payloadHash);
      res.status(402).json({
        x402Version: 1,
        error: `Unsupported network: ${paymentPayload.network}`,
        accepts: Object.values(paymentRequirementsByNetwork),
      });
      return;
    }

    // Verify payment with facilitator
    const verification = await x402Server.verify(paymentPayload, requirements);

    if (!verification.isValid) {
      await removePayloadHash(payloadHash);
      console.warn(`[TEE] Payment invalid: ${verification.invalidReason}`);
      res.status(402).json({
        x402Version: 1,
        error: "Payment verification failed",
        reason: verification.invalidReason,
      });
      return;
    }

    console.log(
      `[TEE] Payment verified from ${verification.payer} on ${paymentPayload.network}`,
    );

    // Store payment context for post-handler settlement
    (req as any).paymentStatus = "paid";
    (req as any).x402PaymentPayload = paymentPayload;
    (req as any).x402PaymentRequirements = requirements;
    (req as any).x402Payer = verification.payer;

    usageStats.paidRequests++;
    usageStats.totalRevenueCents += PRICE_PER_REQUEST_CENTS;

    // Intercept res.json to settle payment after handler completes
    const originalJson = res.json.bind(res);
    res.json = function (body: any) {
      // Settle payment in background (don't block the response)
      x402Server
        .settle(paymentPayload, requirements)
        .then((settlement) => {
          if (settlement.success) {
            console.log(`[TEE] Payment settled: tx=${settlement.transaction}`);
          } else {
            console.error(`[TEE] Settlement failed: ${settlement.errorReason}`);
          }
        })
        .catch((err) => {
          console.error(`[TEE] Settlement error:`, err);
        });

      // Add X-PAYMENT-RESPONSE header with settlement info
      res.set(
        "X-PAYMENT-RESPONSE",
        Buffer.from(
          JSON.stringify({
            x402Version: 1,
            scheme: paymentPayload.scheme,
            network: paymentPayload.network,
            payer: verification.payer,
          }),
        ).toString("base64"),
      );

      return originalJson(body);
    } as any;

    next();
  } catch (error) {
    console.error("[TEE] Payment verification error:", error);
    res.status(500).json({ error: "Payment verification failed" });
  }
}

/**
 * POST /v1/randomness
 * Returns raw 256-bit random seed with attestation
 */
app.post(
  "/v1/randomness",
  paidLimiter,
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { request_hash, metadata } = req.body;

      usageStats.totalRequests++;

      console.log(`[TEE] Randomness request:`, {
        payment: (req as any).paymentStatus,
        metadata,
        total: usageStats.totalRequests,
      });

      // 1. Generate Secure Random Seed
      const randomBytes = crypto.randomBytes(32);
      const seed = randomBytes.toString("hex");

      // 2. Generate Remote Attestation (The "Proof")
      const attestation = await generateAttestation(seed, request_hash);

      // 3. Run commitment operations (non-blocking)
      const commitment = await runCommitments(
        seed,
        request_hash || "",
        attestation,
        "/v1/randomness",
        metadata,
      );

      // 4. Return the result
      res.json({
        random_seed: seed,
        attestation: attestation,
        timestamp: Date.now(),
        tee_type: TEE_TYPE,
        app_id: TEE_INFO.app_id,
        ...(commitment && { commitment }),
      });
    } catch (error) {
      console.error("[TEE] Error generating randomness:", error);
      res.status(500).json({ error: "Internal TEE Error" });
    }
  },
);

/**
 * POST /v1/random/number
 * Returns a random integer between min and max (inclusive)
 * Body: { min?: number, max: number, request_hash?: string }
 */
app.post(
  "/v1/random/number",
  paidLimiter,
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { min = 1, max, request_hash } = req.body;

      if (typeof max !== "number" || max < 1) {
        res
          .status(400)
          .json({ error: "max is required and must be a positive number" });
        return;
      }

      if (min >= max) {
        res.status(400).json({ error: "min must be less than max" });
        return;
      }

      usageStats.totalRequests++;

      // Generate random bytes
      const randomBytes = crypto.randomBytes(32);
      const seed = randomBytes.toString("hex");

      // Convert to number in range [min, max]
      const bigInt = BigInt("0x" + seed.slice(0, 16)); // Use 64 bits
      const range = BigInt(max - min + 1);
      const randomNumber = Number(bigInt % range) + min;

      const rHash = request_hash || `number:${min}-${max}`;
      const attestation = await generateAttestation(seed, rHash);

      const commitment = await runCommitments(
        seed,
        rHash,
        attestation,
        "/v1/random/number",
        {
          min,
          max,
        },
      );

      res.json({
        number: randomNumber,
        min,
        max,
        random_seed: seed,
        attestation,
        timestamp: Date.now(),
        tee_type: TEE_TYPE,
        ...(commitment && { commitment }),
      });
    } catch (error) {
      console.error("[TEE] Error generating random number:", error);
      res.status(500).json({ error: "Internal TEE Error" });
    }
  },
);

/**
 * POST /v1/random/pick
 * Picks one random item from a provided list
 * Body: { items: any[], request_hash?: string }
 */
app.post(
  "/v1/random/pick",
  paidLimiter,
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { items, request_hash } = req.body;

      if (!Array.isArray(items) || items.length === 0) {
        res.status(400).json({ error: "items must be a non-empty array" });
        return;
      }

      if (items.length > 100000) {
        res
          .status(400)
          .json({ error: "items array cannot exceed 100,000 elements" });
        return;
      }

      usageStats.totalRequests++;

      const randomBytes = crypto.randomBytes(32);
      const seed = randomBytes.toString("hex");

      // Pick random index
      const bigInt = BigInt("0x" + seed.slice(0, 16));
      const index = Number(bigInt % BigInt(items.length));
      const picked = items[index];

      const rHash = request_hash || `pick:${items.length}`;
      const attestation = await generateAttestation(seed, rHash);

      const commitment = await runCommitments(
        seed,
        rHash,
        attestation,
        "/v1/random/pick",
        {
          total_items: items.length,
        },
      );

      res.json({
        picked,
        index,
        total_items: items.length,
        random_seed: seed,
        attestation,
        timestamp: Date.now(),
        tee_type: TEE_TYPE,
        ...(commitment && { commitment }),
      });
    } catch (error) {
      console.error("[TEE] Error picking random item:", error);
      res.status(500).json({ error: "Internal TEE Error" });
    }
  },
);

/**
 * POST /v1/random/shuffle
 * Shuffles a list using Fisher-Yates algorithm with TEE randomness
 * Body: { items: any[], request_hash?: string }
 */
app.post(
  "/v1/random/shuffle",
  paidLimiter,
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { items, request_hash } = req.body;

      if (!Array.isArray(items) || items.length === 0) {
        res.status(400).json({ error: "items must be a non-empty array" });
        return;
      }

      if (items.length > 1000) {
        res.status(400).json({
          error: "items array cannot exceed 1,000 elements for shuffle",
        });
        return;
      }

      usageStats.totalRequests++;

      // Generate enough random bytes for the shuffle
      const bytesNeeded = Math.ceil(items.length * 4); // 4 bytes per swap decision
      const randomBytes = crypto.randomBytes(Math.max(32, bytesNeeded));
      const seed = randomBytes.slice(0, 32).toString("hex");

      // Fisher-Yates shuffle using TEE randomness
      const shuffled = [...items];
      for (let i = shuffled.length - 1; i > 0; i--) {
        // Use 4 bytes for each random choice
        const offset = (shuffled.length - 1 - i) * 4;
        const randomValue = randomBytes.readUInt32BE(
          offset % randomBytes.length,
        );
        const j = randomValue % (i + 1);
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }

      const rHash = request_hash || `shuffle:${items.length}`;
      const attestation = await generateAttestation(seed, rHash);

      const commitment = await runCommitments(
        seed,
        rHash,
        attestation,
        "/v1/random/shuffle",
        {
          original_count: items.length,
        },
      );

      res.json({
        shuffled,
        original_count: items.length,
        random_seed: seed,
        attestation,
        timestamp: Date.now(),
        tee_type: TEE_TYPE,
        ...(commitment && { commitment }),
      });
    } catch (error) {
      console.error("[TEE] Error shuffling items:", error);
      res.status(500).json({ error: "Internal TEE Error" });
    }
  },
);

/**
 * POST /v1/random/winners
 * Pick multiple unique winners from a list
 * Body: { items: any[], count: number, request_hash?: string }
 */
app.post(
  "/v1/random/winners",
  paidLimiter,
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { items, count = 1, request_hash } = req.body;

      if (!Array.isArray(items) || items.length === 0) {
        res.status(400).json({ error: "items must be a non-empty array" });
        return;
      }

      if (typeof count !== "number" || count < 1) {
        res.status(400).json({ error: "count must be a positive number" });
        return;
      }

      if (count > items.length) {
        res
          .status(400)
          .json({ error: "count cannot exceed the number of items" });
        return;
      }

      if (items.length > 100000) {
        res
          .status(400)
          .json({ error: "items array cannot exceed 100,000 elements" });
        return;
      }

      usageStats.totalRequests++;

      // Generate enough randomness for selecting winners
      const bytesNeeded = Math.ceil(count * 4); // 4 bytes per selection
      const randomBytes = crypto.randomBytes(Math.max(32, bytesNeeded));
      const seed = randomBytes.slice(0, 32).toString("hex");

      // Use Fisher-Yates partial shuffle for deterministic, collision-free selection
      // This is more efficient and reliable than reservoir sampling
      const itemsCopy = [...items];
      const winners: any[] = [];

      for (let i = 0; i < count; i++) {
        // Use 4 bytes for each random selection
        const offset = i * 4;
        const randomValue = randomBytes.readUInt32BE(
          offset % randomBytes.length,
        );

        // Select random index from remaining items
        const j = i + (randomValue % (itemsCopy.length - i));

        // Swap selected item to position i
        [itemsCopy[i], itemsCopy[j]] = [itemsCopy[j], itemsCopy[i]];

        // Add to winners with metadata
        winners.push({
          item: itemsCopy[i],
          index: items.indexOf(itemsCopy[i]),
          position: i + 1,
        });
      }

      const rHash = request_hash || `winners:${count}of${items.length}`;
      const attestation = await generateAttestation(seed, rHash);

      const commitment = await runCommitments(
        seed,
        rHash,
        attestation,
        "/v1/random/winners",
        {
          count: winners.length,
          total_items: items.length,
        },
      );

      res.json({
        winners,
        count: winners.length,
        total_items: items.length,
        random_seed: seed,
        attestation,
        timestamp: Date.now(),
        tee_type: TEE_TYPE,
        ...(commitment && { commitment }),
      });
    } catch (error) {
      console.error("[TEE] Error selecting winners:", error);
      res.status(500).json({ error: "Internal TEE Error" });
    }
  },
);

/**
 * POST /v1/random/uuid
 * Generates a cryptographically secure UUIDv4
 * Body: { request_hash?: string }
 */
app.post(
  "/v1/random/uuid",
  paidLimiter,
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { request_hash } = req.body;

      usageStats.totalRequests++;

      const randomBytes = crypto.randomBytes(32);
      const seed = randomBytes.toString("hex");

      // Generate UUIDv4 from random bytes
      const uuidBytes = randomBytes.slice(0, 16);
      uuidBytes[6] = (uuidBytes[6] & 0x0f) | 0x40; // Version 4
      uuidBytes[8] = (uuidBytes[8] & 0x3f) | 0x80; // Variant 1

      const uuid = [
        uuidBytes.slice(0, 4).toString("hex"),
        uuidBytes.slice(4, 6).toString("hex"),
        uuidBytes.slice(6, 8).toString("hex"),
        uuidBytes.slice(8, 10).toString("hex"),
        uuidBytes.slice(10, 16).toString("hex"),
      ].join("-");

      const rHash = request_hash || `uuid`;
      const attestation = await generateAttestation(seed, rHash);

      const commitment = await runCommitments(
        seed,
        rHash,
        attestation,
        "/v1/random/uuid",
      );

      res.json({
        uuid,
        random_seed: seed,
        attestation,
        timestamp: Date.now(),
        tee_type: TEE_TYPE,
        ...(commitment && { commitment }),
      });
    } catch (error) {
      console.error("[TEE] Error generating UUID:", error);
      res.status(500).json({ error: "Internal TEE Error" });
    }
  },
);

/**
 * POST /v1/random/dice
 * Roll dice (e.g., 2d6, 1d20)
 * Body: { dice: string (e.g., "2d6"), request_hash?: string }
 */
app.post(
  "/v1/random/dice",
  paidLimiter,
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { dice, request_hash } = req.body;

      if (typeof dice !== "string") {
        res
          .status(400)
          .json({ error: 'dice must be a string (e.g., "2d6", "1d20")' });
        return;
      }

      const match = dice.toLowerCase().match(/^(\d+)d(\d+)$/);
      if (!match) {
        res.status(400).json({
          error: 'Invalid dice format. Use "NdM" (e.g., "2d6", "1d20")',
        });
        return;
      }

      const numDice = parseInt(match[1], 10);
      const sides = parseInt(match[2], 10);

      if (numDice < 1 || numDice > 100) {
        res
          .status(400)
          .json({ error: "Number of dice must be between 1 and 100" });
        return;
      }

      if (sides < 2 || sides > 1000) {
        res
          .status(400)
          .json({ error: "Dice sides must be between 2 and 1000" });
        return;
      }

      usageStats.totalRequests++;

      const randomBytes = crypto.randomBytes(Math.max(32, numDice * 4));
      const seed = randomBytes.slice(0, 32).toString("hex");

      const rolls: number[] = [];
      for (let i = 0; i < numDice; i++) {
        const value = randomBytes.readUInt32BE((i * 4) % randomBytes.length);
        rolls.push((value % sides) + 1);
      }

      const total = rolls.reduce((a, b) => a + b, 0);
      const rHash = request_hash || `dice:${dice}`;
      const attestation = await generateAttestation(seed, rHash);

      const commitment = await runCommitments(
        seed,
        rHash,
        attestation,
        "/v1/random/dice",
        {
          dice,
          num_dice: numDice,
          sides,
        },
      );

      res.json({
        dice,
        rolls,
        total,
        min_possible: numDice,
        max_possible: numDice * sides,
        random_seed: seed,
        attestation,
        timestamp: Date.now(),
        tee_type: TEE_TYPE,
        ...(commitment && { commitment }),
      });
    } catch (error) {
      console.error("[TEE] Error rolling dice:", error);
      res.status(500).json({ error: "Internal TEE Error" });
    }
  },
);

/**
 * GET /v1/health
 */
app.get("/v1/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    service: "verifiable-randomness-service",
    tee_type: TEE_TYPE,
    version: VERSION,
    environment: process.env.APP_ENVIRONMENT || "development",
    timestamp: new Date().toISOString(),
    x402_enabled: true,
    price_per_request: `$${(PRICE_PER_REQUEST_CENTS / 100).toFixed(2)}`,
    app_id: TEE_INFO.app_id,
    verification_available: TEE_TYPE === "tdx",
    arweave_enabled: ARWEAVE_ENABLED,
    endpoints: [
      "POST /v1/randomness - Raw 256-bit seed",
      "POST /v1/random/number - Random number in range",
      "POST /v1/random/pick - Pick one from list",
      "POST /v1/random/shuffle - Shuffle a list",
      "POST /v1/random/winners - Pick multiple winners",
      "POST /v1/random/uuid - Generate UUIDv4",
      "POST /v1/random/dice - Roll dice (e.g., 2d6)",
    ],
  });
});

/**
 * GET /v1/stats
 */
app.get("/v1/stats", (req: Request, res: Response) => {
  const apiKey = req.get("X-API-Key") || req.query.api_key;

  if (!apiKey || !API_KEYS.includes(apiKey as string)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  res.json({
    stats: usageStats,
    uptime: process.uptime(),
    tee_type: TEE_TYPE,
  });
});

/**
 * GET / - Landing page
 */
app.get("/", (_req: Request, res: Response) => {
  const appId = TEE_INFO.app_id;
  const composeHash = TEE_INFO.compose_hash || "Loading...";
  const cluster = process.env.PHALA_CLUSTER || "prod9";
  const nodeUrl = `https://${appId}-8090.dstack-pha-${cluster}.phala.network/`;
  const heliusRpcUrl = process.env.HELIUS_RPC_URL || "";
  const baseRpcUrl = process.env.BASE_RPC_URL || "";

  const html = renderLandingPage({
    version: VERSION,
    teeType: TEE_TYPE,
    paymentWallet: PAYMENT_WALLET,
    paymentWalletBase: PAYMENT_WALLET_BASE,
    heliusRpcUrl,
    baseRpcUrl,
    facilitatorUrl: X402_FACILITATOR_URL,
    supportedNetworks: SUPPORTED_NETWORKS,
    arweaveEnabled: ARWEAVE_ENABLED,
    appId,
    composeHash,
    nodeUrl,
    environment: process.env.APP_ENVIRONMENT || "development",
  });

  res.type("html").send(html);
});

/**
 * GET /v1/attestation - Public verification data
 * Returns attestation info for independent verification
 */
app.get("/v1/attestation", async (_req: Request, res: Response) => {
  try {
    const dstack = getDstackClient();

    if (!dstack) {
      res.json({
        tee_type: TEE_TYPE,
        verified: false,
        error: "TEE hardware not available (simulation mode)",
        verification_url: null,
      });
      return;
    }

    // Get fresh attestation quote for verification
    const reportData = crypto
      .createHash("sha256")
      .update("attestation-request")
      .digest();
    const quote = await dstack.getQuote(reportData);

    if (!quote || !quote.quote) {
      res.status(500).json({ error: "Failed to generate attestation" });
      return;
    }

    // Parse event log to extract compose-hash and instance-id
    let composeHash = TEE_INFO.compose_hash;
    let instanceId = TEE_INFO.instance_id;

    if (quote.event_log) {
      try {
        const events = JSON.parse(quote.event_log);
        for (const event of events) {
          if (event.event === "compose-hash") {
            composeHash = event.event_payload;
            TEE_INFO.compose_hash = composeHash;
          }
          if (event.event === "instance-id") {
            instanceId = event.event_payload;
            TEE_INFO.instance_id = instanceId;
          }
          if (event.event === "app-id") {
            TEE_INFO.app_id = event.event_payload;
          }
        }
      } catch {
        // Event log parsing failed, use defaults
      }
    }

    res.json({
      tee_type: TEE_TYPE,
      verified: true,
      app_id: TEE_INFO.app_id,
      compose_hash: composeHash,
      instance_id: instanceId,
      quote_hex: quote.quote,
      event_log: quote.event_log,
      verification: {
        phala_cloud_api:
          "https://cloud-api.phala.network/api/v1/attestations/verify",
        phala_dashboard: `https://cloud.phala.network/dashboard/cvms/${TEE_INFO.app_id}`,
        instructions:
          "POST the quote_hex to the verification API to verify this attestation",
      },
      source_code: {
        repository: "https://github.com/mysterygift/mystery-gift",
        path: "tee-worker/",
      },
    });
  } catch (error) {
    console.error("[TEE] Attestation info error:", error);
    res.status(500).json({ error: "Failed to get attestation info" });
  }
});

/**
 * POST /v1/verify - Verify an attestation quote
 * Uses Phala Cloud's centralized verification API
 */
app.post("/v1/verify", async (req: Request, res: Response) => {
  try {
    const { attestation, quote_hex } = req.body;

    let quoteToVerify: string | undefined;

    // Accept either base64-encoded attestation or raw hex quote
    if (attestation) {
      try {
        const decoded = JSON.parse(
          Buffer.from(attestation, "base64").toString(),
        );
        if (decoded.type === "mock-tee-attestation") {
          res.json({
            valid: false,
            error: "Mock attestation cannot be verified",
            tee_type: "simulation",
          });
          return;
        }
        quoteToVerify = decoded.quote;
      } catch {
        res.status(400).json({ error: "Invalid attestation format" });
        return;
      }
    } else if (quote_hex) {
      quoteToVerify = quote_hex;
    }

    if (!quoteToVerify) {
      res
        .status(400)
        .json({ error: "Missing attestation or quote_hex parameter" });
      return;
    }

    // Call Phala Cloud's verification API
    const verifyResponse = await fetch(
      "https://cloud-api.phala.network/api/v1/attestations/verify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hex: quoteToVerify }),
        // Break request if it takes too long (5s timeout)
        // @ts-ignore - AbortSignal.timeout is available in Node 18+ but might not be in types
        signal: (AbortSignal as any).timeout(5000),
      },
    );

    if (!verifyResponse.ok) {
      const errorText = await verifyResponse.text();
      res.status(verifyResponse.status).json({
        valid: false,
        error: `Phala Cloud verification failed: ${errorText}`,
      });
      return;
    }

    const result = await verifyResponse.json();

    res.json({
      valid: result.quote?.verified === true,
      verification_result: result,
      verified_by: "Phala Cloud Attestation API",
      verified_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[TEE] Verification error:", error);
    res.status(500).json({ error: "Verification failed" });
  }
});

/**
 * Shared page template for static pages (Terms, Privacy)
 */
function renderStaticPage(title: string, content: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} | MYSTERY GIFT</title>
  
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Sometype+Mono:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap" rel="stylesheet">
  
  <style>
    :root {
      --bg: #09090b;
      --panel-bg: rgba(20, 20, 23, 0.85);
      --panel-border: rgba(255, 255, 255, 0.08);
      --text-main: #FAFAFA;
      --text-muted: #A1A1AA;
      --accent: #FF4D00;
      --font: 'Sometype Mono', monospace;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: var(--font);
      background-color: var(--bg);
      color: var(--text-main);
      min-height: 100vh;
      /* Question Mark Texture */
      background-image: url("data:image/svg+xml,%3Csvg width='400' height='400' viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cstyle%3Etext { font-family: monospace; fill: %23ffffff; opacity: 0.02; font-weight: bold; user-select: none; }%3C/style%3E%3Ctext x='50' y='80' font-size='120' transform='rotate(15 50,80)'%3E?%3C/text%3E%3Ctext x='300' y='150' font-size='80' transform='rotate(-20 300,150)'%3E?%3C/text%3E%3Ctext x='150' y='300' font-size='160' transform='rotate(10 150,300)'%3E?%3C/text%3E%3Ctext x='350' y='350' font-size='60' transform='rotate(30 350,350)'%3E?%3C/text%3E%3Ctext x='100' y='200' font-size='40' opacity='0.04' transform='rotate(-45 100,200)'%3E?%3C/text%3E%3Ctext x='250' y='50' font-size='90' transform='rotate(5 250,50)'%3E?%3C/text%3E%3Ctext x='20' y='380' font-size='70' transform='rotate(-15 20,380)'%3E?%3C/text%3E%3C/svg%3E");
    }

    .container {
      max-width: 800px;
      margin: 0 auto;
      padding: 3rem 2rem;
    }

    .back-link {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      color: var(--text-muted);
      text-decoration: none;
      font-size: 0.85rem;
      margin-bottom: 2rem;
      transition: color 0.2s;
    }

    .back-link:hover {
      color: var(--accent);
    }

    .content-card {
      background: var(--panel-bg);
      border: 1px solid var(--panel-border);
      border-radius: 12px;
      padding: 2.5rem;
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
    }

    h1 {
      font-size: 2rem;
      font-weight: 700;
      margin-bottom: 0.5rem;
      text-transform: uppercase;
      letter-spacing: -0.02em;
    }

    .subtitle {
      color: var(--accent);
      font-size: 0.85rem;
      font-weight: 600;
      margin-bottom: 2rem;
      text-transform: uppercase;
      letter-spacing: 0.1em;
    }

    h2 {
      font-size: 1.1rem;
      font-weight: 600;
      margin-top: 2rem;
      margin-bottom: 1rem;
      color: var(--text-main);
    }

    p, li {
      font-size: 0.9rem;
      line-height: 1.7;
      color: var(--text-muted);
      margin-bottom: 1rem;
    }

    ul {
      padding-left: 1.5rem;
      margin-bottom: 1rem;
    }

    li {
      margin-bottom: 0.5rem;
    }

    a {
      color: var(--accent);
      text-decoration: none;
    }

    a:hover {
      text-decoration: underline;
    }

    .footer {
      text-align: center;
      padding: 2rem;
      color: var(--text-muted);
      font-size: 0.75rem;
    }

    .footer a {
      color: var(--text-muted);
      margin: 0 0.5rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <a href="/" class="back-link">&larr; Back to Home</a>
    <div class="content-card">
      ${content}
    </div>
  </div>
  <div class="footer">
    &copy; 2026 MYSTERY GIFT &bull; <a href="/terms">Terms</a> &bull; <a href="/privacy">Privacy</a> &bull; <a href="https://x.com/mysterygift_fun" target="_blank">X</a>
  </div>
</body>
</html>
  `;
}

/**
 * GET /changelog - Changelog Page
 */
app.get("/changelog", (_req: Request, res: Response) => {
  const changelogPath = path.join(__dirname, "../CHANGELOG.md");
  let md = "";
  try {
    md = fs.readFileSync(changelogPath, "utf-8");
  } catch (e) {
    md = "Changelog not found.";
  }

  let sections: string[] = [];
  let currentSection = "";
  let preamble = "";
  let inVersion = false;
  let inList = false;
  const lines = md.split("\n");

  for (const line of lines) {
    let l = line.trim();

    // Header Detection
    if (l.startsWith("## ")) {
      // New Version Block
      if (inVersion) {
        if (inList) {
          currentSection += "</ul>\n";
          inList = false;
        }
        sections.push(currentSection);
      } else {
        // End of preamble
        if (inList) {
          preamble += "</ul>\n";
          inList = false;
        }
      }
      inVersion = true;
      currentSection = `<h2>${l.slice(3)}</h2>`;
    }
    // Main Title (Skip or add to preamble)
    else if (l.startsWith("# ")) {
      // Title usually "Changelog", we ignore it or add to preamble
      continue;
    }
    // Content Parsing
    else {
      let htmlLine = "";
      if (!l) {
        if (inList) {
          htmlLine = "</ul>\n";
          inList = false;
        }
      } else if (l.startsWith("### ")) {
        if (inList) {
          htmlLine += "</ul>\n";
          inList = false;
        }
        htmlLine += `<h3>${l.slice(4)}</h3>`;
      } else if (l.startsWith("- ")) {
        if (!inList) {
          htmlLine += "<ul>\n";
          inList = true;
        }
        let text = l.slice(2);
        text = text.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
        text = text.replace(/`([^`]*)`/g, "<code>$1</code>");
        text = text.replace(
          /\[(.*?)\]\((.*?)\)/g,
          '<a href="$2" target="_blank">$1</a>',
        );
        htmlLine += `<li>${text}</li>`;
      } else {
        if (inList) {
          htmlLine += "</ul>\n";
          inList = false;
        }
        htmlLine += `<p>${l}</p>`;
      }

      if (inVersion) currentSection += htmlLine;
      else preamble += htmlLine;
    }
  }

  // Push last section
  if (inList) {
    if (inVersion) currentSection += "</ul>\n";
    else preamble += "</ul>\n";
  }
  if (inVersion) sections.push(currentSection);

  // Reverse Order (Oldest First)
  sections.reverse();

  let content = preamble + sections.join("\n");

  res.type("html").send(renderStaticPage("Changelog", content));
});

/**
 * GET /terms - Terms of Service
 */
app.get("/terms", (_req: Request, res: Response) => {
  const content = `
    <h1>Terms of Service</h1>
    <div class="subtitle">Last Updated: January 2026</div>
    
    <h2>1. Acceptance of Terms</h2>
    <p>By accessing or using the Mystery Gift TEE Randomness Service ("Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, do not use the Service.</p>
    
    <h2>2. Description of Service</h2>
    <p>Mystery Gift provides a verifiable randomness service running inside an Intel TDX Trusted Execution Environment (TEE). The Service generates cryptographically secure random numbers with remote attestation proofs.</p>
    
    <h2>3. Payment Terms</h2>
    <p>The Service operates on a pay-per-request model using the x402 protocol:</p>
    <ul>
      <li>Standard rate: $0.01 USD per request</li>
      <li>Payments accepted in USDC or SOL on Solana</li>
      <li>All payments are final and non-refundable</li>
      <li>API key holders may access the service without per-request payments</li>
    </ul>
    
    <h2>4. Permitted Use</h2>
    <p>You may use the Service for:</p>
    <ul>
      <li>NFT mints and digital collectibles</li>
      <li>Gaming and lottery applications</li>
      <li>Fair selection and raffle systems</li>
      <li>Any lawful purpose requiring verifiable randomness</li>
    </ul>
    
    <h2>5. Prohibited Use</h2>
    <p>You may not use the Service for:</p>
    <ul>
      <li>Any illegal gambling activities in your jurisdiction</li>
      <li>Fraudulent or deceptive practices</li>
      <li>Attempting to compromise or exploit the TEE environment</li>
      <li>Denial of service attacks or abuse</li>
    </ul>
    
    <h2>6. Disclaimer of Warranties</h2>
    <p>THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND. We do not guarantee uninterrupted service availability. While the TEE provides hardware-level security guarantees, we make no warranty regarding fitness for any particular purpose.</p>
    
    <h2>7. Limitation of Liability</h2>
    <p>IN NO EVENT SHALL MYSTERY GIFT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, OR CONSEQUENTIAL DAMAGES ARISING FROM USE OF THE SERVICE.</p>
    
    <h2>8. Changes to Terms</h2>
    <p>We reserve the right to modify these terms at any time. Continued use of the Service after changes constitutes acceptance of the new terms.</p>
    
    <h2>9. Contact</h2>
    <p>For questions about these Terms, contact us on <a href="https://x.com/mysterygift_fun" target="_blank">X</a>.</p>
  `;

  res.type("html").send(renderStaticPage("Terms of Service", content));
});

/**
 * GET /privacy - Privacy Policy
 */
app.get("/privacy", (_req: Request, res: Response) => {
  const content = `
    <h1>Privacy Policy</h1>
    <div class="subtitle">Last Updated: January 2026</div>
    
    <h2>1. Information We Collect</h2>
    <p>When you use the Mystery Gift TEE Randomness Service, we may collect:</p>
    <ul>
      <li><strong>Wallet Addresses:</strong> Public Solana wallet addresses used for payments</li>
      <li><strong>Transaction Data:</strong> Payment transaction signatures for verification</li>
      <li><strong>Request Metadata:</strong> Timestamps, request types, and attestation data</li>
      <li><strong>Technical Data:</strong> IP addresses and request headers for security purposes</li>
    </ul>
    
    <h2>2. How We Use Information</h2>
    <p>We use collected information to:</p>
    <ul>
      <li>Process and verify payments</li>
      <li>Prevent fraud and replay attacks</li>
      <li>Generate usage statistics (anonymized)</li>
      <li>Improve and maintain the Service</li>
    </ul>
    
    <h2>3. TEE Security</h2>
    <p>All randomness generation occurs within an Intel TDX Trusted Execution Environment. This means:</p>
    <ul>
      <li>Random seeds are generated in hardware-isolated memory</li>
      <li>Even service operators cannot access or predict random values</li>
      <li>Remote attestation proves the integrity of the execution environment</li>
    </ul>
    
    <h2>4. Data Retention</h2>
    <p>We retain:</p>
    <ul>
      <li>Payment signatures: 1 hour (for replay attack prevention)</li>
      <li>Usage statistics: Aggregated and anonymized, retained indefinitely</li>
      <li>Error logs: 30 days for debugging purposes</li>
    </ul>
    
    <h2>5. Data Sharing</h2>
    <p>We do not sell or share your personal information with third parties, except:</p>
    <ul>
      <li>When required by law</li>
      <li>To prevent fraud or security threats</li>
      <li>Anonymized, aggregated statistics may be shared publicly</li>
    </ul>
    
    <h2>6. Blockchain Transparency</h2>
    <p>Please note that Solana blockchain transactions are public. Wallet addresses and transaction data are visible on the public blockchain regardless of our privacy practices.</p>
    
    <h2>7. Your Rights</h2>
    <p>You have the right to:</p>
    <ul>
      <li>Access information we hold about your wallet address</li>
      <li>Request deletion of non-essential data</li>
      <li>Opt out of non-essential data collection</li>
    </ul>
    
    <h2>8. Changes to Policy</h2>
    <p>We may update this Privacy Policy periodically. Changes will be posted on this page with an updated revision date.</p>
    
    <h2>9. Contact</h2>
    <p>For privacy-related inquiries, contact us on <a href="https://x.com/mysterygift_fun" target="_blank">X</a>.</p>
  `;

  res.type("html").send(renderStaticPage("Privacy Policy", content));
});

/**
 * Helper to interact with TEE hardware for attestation via dStack SDK
 */
async function generateAttestation(
  seed: string,
  requestHash: string,
): Promise<string> {
  // Combine seed and request hash to prevent replay attacks
  const reportData = crypto
    .createHash("sha256")
    .update(seed)
    .update(requestHash || "")
    .digest();

  try {
    // Use dStack SDK to get quote
    const dstack = getDstackClient();
    if (!dstack) throw new Error("dStack client not initialized");

    // Pass the raw Buffer (32 bytes) directly to the SDK
    // The SDK handles sending this as the report_data for the quote
    const quote = await dstack.getQuote(reportData);

    if (quote && quote.quote) {
      // Wrap the real quote in a JSON object to match the server's expected format
      // and provide additional verification data (event log, etc.)
      return Buffer.from(
        JSON.stringify({
          type: "tdx-attestation",
          quote: quote.quote,
          event_log: quote.event_log,
          algorithm: "sha256",
          provider: "phala-dstack",
        }),
      ).toString("base64");
    } else {
      throw new Error("Invalid quote response from SDK");
    }
  } catch (error) {
    console.warn(
      "[TEE] Attestation failed, falling back to simulation:",
      error,
    );

    // In production, refuse to serve mock attestations
    if (process.env.NODE_ENV === "production") {
      console.error(
        "[TEE] CRITICAL: TEE attestation failed in production — refusing to serve mock",
      );
      throw new Error("TEE attestation unavailable in production");
    }

    // Fallback for development/simulation mode only
    return Buffer.from(
      JSON.stringify({
        type: "mock-tee-attestation",
        report_data: reportData.toString("hex"),
        timestamp: Date.now(),
        warning: "No TEE hardware detected - simulation mode",
      }),
    ).toString("base64");
  }
}

// Start server
async function start() {
  // Global error handler for uncaught exceptions
  process.on("uncaughtException", (err) => {
    console.error("[TEE] Uncaught Exception:", err);
  });

  process.on("unhandledRejection", (reason, promise) => {
    console.error("[TEE] Unhandled Rejection at:", promise, "reason:", reason);
  });

  // Try to detect TEE type via SDK info
  const dstack = getDstackClient();
  if (dstack) {
    try {
      // SDK doesn't have explicit "detect" but getting info should work
      const info = await dstack.info().catch(() => null);
      if (info) {
        TEE_TYPE = "tdx";
        console.log("[TEE] dStack detected, running in TDX mode");
      } else {
        console.log("[TEE] dStack not detected, running in simulation mode");
      }
    } catch (e) {
      console.log("[TEE] Error checking dStack status:", e);
    }
  }

  // Initialize commitment keypair for Arweave uploads
  if (ARWEAVE_ENABLED) {
    const kp = await getCommitmentKeypair();
    if (kp) {
      console.log(
        `[TEE] Arweave proofs enabled, key: ${kp.publicKey.toBase58()}`,
      );
    } else {
      console.warn(
        "[TEE] Arweave proofs enabled but keypair derivation failed",
      );
    }
  } else {
    console.log("[TEE] Arweave proofs disabled via ARWEAVE_ENABLED=false");
  }

  // CRITICAL: Warn loudly if running in simulation mode in production
  if (TEE_TYPE === "simulation" && process.env.NODE_ENV === "production") {
    console.error("=".repeat(80));
    console.error(
      "[TEE] CRITICAL WARNING: Running in SIMULATION mode in PRODUCTION",
    );
    console.error(
      "[TEE] Attestations will be REFUSED. TEE hardware is required for production.",
    );
    console.error("=".repeat(80));
  }

  // Serve static files
  app.use("/assets", express.static(path.join(__dirname, "../static")));

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`[TEE] Randomness Worker v2.8 running on port ${PORT}`);
    console.log(`[TEE] Environment: ${TEE_TYPE.toUpperCase()}`);
  });

  // Graceful shutdown
  const shutdown = () => {
    console.log("[TEE] Shutting down...");
    server.close(() => {
      console.log("[TEE] Server closed");
      process.exit(0);
    });
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

start();

export { app };
