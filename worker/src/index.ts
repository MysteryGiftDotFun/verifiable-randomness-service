import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { DstackClient } from '@phala/dstack-sdk';
import { Connection, PublicKey } from '@solana/web3.js';
import { LRUCache } from 'lru-cache';
import rateLimit from 'express-rate-limit';
import * as Sentry from '@sentry/node';

// Initialize GlitchTip/Sentry monitoring
if (process.env.GLITCHTIP_DSN) {
  Sentry.init({
    dsn: process.env.GLITCHTIP_DSN,
    environment: process.env.NODE_ENV || 'development',
    release: `tee-worker@${process.env.npm_package_version || '0.0.5'}`,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  });
  console.log('[TEE] GlitchTip/Sentry monitoring initialized');
}

const app = express();

app.use(express.json());

// Strict CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? [
        'https://mysterygift.fun',
        'https://rng.mysterygift.fun',
        /\.mysterygift\.fun$/,
      ]
    : true, // Allow all in development
  credentials: true,
  optionsSuccessStatus: 200,
}));

const PORT = process.env.PORT || 3000;

// Configuration
const PRICE_PER_REQUEST_CENTS = 1; // $0.01 per attestation
const WHITELIST = (process.env.WHITELIST || '').split(',').filter(Boolean);
const API_KEYS = (process.env.API_KEYS || '').split(',').filter(Boolean);
const PAYMENT_WALLET = process.env.PAYMENT_WALLET || '3Qudd5FG8foyFnbKxwfkDktnuushG7CDHBMSNk9owAjx';

// Load version from package.json
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf-8'));
const VERSION = packageJson.version;

// RPC Provider Configuration (Helius primary, Alchemy fallback)
const RPC_PROVIDERS = [
  {
    name: 'Helius',
    url: process.env.HELIUS_RPC_URL || '',
    priority: 1,
  },
  {
    name: 'Alchemy',
    url: process.env.ALCHEMY_RPC_URL || '',
    priority: 2,
  },
  {
    name: 'Public',
    url: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
    priority: 3,
  },
].filter((p) => p.url); // Only include providers with URLs

// RPC connections pool
const rpcConnections: Map<string, Connection> = new Map();

function getConnection(providerName: string): Connection | null {
  const provider = RPC_PROVIDERS.find((p) => p.name === providerName);
  if (!provider) return null;

  if (!rpcConnections.has(providerName)) {
    rpcConnections.set(providerName, new Connection(provider.url, 'confirmed'));
    console.log(`[TEE] Initialized ${providerName} RPC connection`);
  }
  return rpcConnections.get(providerName)!;
}

// Get primary connection (first available)
function getPrimaryConnection(): Connection {
  for (const provider of RPC_PROVIDERS) {
    const conn = getConnection(provider.name);
    if (conn) return conn;
  }
  // Fallback to public RPC
  return new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
}

// Execute RPC call with fallback
async function rpcWithFallback<T>(
  operation: (conn: Connection) => Promise<T>,
  operationName: string
): Promise<T> {
  const errors: { provider: string; error: string }[] = [];

  for (const provider of RPC_PROVIDERS) {
    const conn = getConnection(provider.name);
    if (!conn) continue;

    try {
      const result = await operation(conn);
      return result;
    } catch (error: any) {
      const errorMsg = error.message || String(error);
      errors.push({ provider: provider.name, error: errorMsg });

      // Log the failure
      console.warn(`[TEE] ${operationName} failed on ${provider.name}: ${errorMsg}`);

      // Check if it's a rate limit / 403 error
      if (errorMsg.includes('403') || errorMsg.includes('429') || errorMsg.includes('rate limit')) {
        console.log(`[TEE] Rate limited on ${provider.name}, trying fallback...`);
        continue;
      }

      // For other errors, still try fallback
      continue;
    }
  }

  // All providers failed
  const errorSummary = errors.map((e) => `${e.provider}: ${e.error}`).join('; ');
  throw new Error(`${operationName} failed on all providers: ${errorSummary}`);
}

// Blockhash caching (reduces RPC calls by ~50%)
const BLOCKHASH_CACHE_TTL_MS = 30000; // 30 seconds (blockhash valid for ~60-90s)
let blockhashCache: {
  blockhash: string;
  lastSlot: number;
  timestamp: number;
} | null = null;

async function getCachedBlockhash(): Promise<{ blockhash: string; lastSlot: number }> {
  const now = Date.now();

  // Return cached blockhash if still valid
  if (blockhashCache && now - blockhashCache.timestamp < BLOCKHASH_CACHE_TTL_MS) {
    return { blockhash: blockhashCache.blockhash, lastSlot: blockhashCache.lastSlot };
  }

  // Fetch new blockhash with fallback
  const result = await rpcWithFallback(async (conn) => {
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
    return { blockhash, lastSlot: lastValidBlockHeight };
  }, 'getLatestBlockhash');

  // Cache the result
  blockhashCache = {
    blockhash: result.blockhash,
    lastSlot: result.lastSlot,
    timestamp: now,
  };

  console.log(`[TEE] Cached new blockhash: ${result.blockhash.slice(0, 16)}...`);
  return result;
}

// TEE deployment info
let TEE_INFO: {
  app_id: string;
  compose_hash: string;
  instance_id: string;
} = {
  app_id: process.env.PHALA_APP_ID || '0fd4d6d4ad7d850389643319dd0e35ad14f578a5',
  compose_hash: '',
  instance_id: '',
};

// Used signatures LRU cache (prevent replay attacks + DOS)
const usedSignatures = new LRUCache<string, boolean>({
  max: 10000, // Max 10k signatures to prevent memory exhaustion
  ttl: 3600000, // 1 hour TTL (auto-cleanup)
  ttlAutopurge: true,
});

// Log cache stats periodically
setInterval(() => {
  console.log(`[TEE] Signature cache: ${usedSignatures.size}/${usedSignatures.max} entries`);
}, 3600000);

// Log RPC configuration on startup
console.log('[TEE] RPC Providers configured:', RPC_PROVIDERS.map((p) => p.name).join(' → '));

// dStack Client for Attestation
let client: DstackClient | null = null;

function getDstackClient(): DstackClient | null {
  if (client) return client;
  try {
    client = new DstackClient();
    TEE_TYPE = 'tdx';
    console.log('[TEE] dStack client initialized successfully');
    return client;
  } catch (e) {
    // Check silently, will retry next time
    return null;
  }
}

// Initialize on startup if possible
getDstackClient();
if (!client) {
  console.log('[TEE] dStack socket not found, client disabled (simulation mode)');
}

let TEE_TYPE = 'simulation';

// Usage tracking (in-memory for now, use Redis/DB in production)
const usageStats = {
  totalRequests: 0,
  paidRequests: 0,
  whitelistedRequests: 0,
  totalRevenueCents: 0,
};

// Rate limiters
const globalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute per IP
  message: { error: 'Too many requests, please slow down' },
  standardHeaders: true,
  legacyHeaders: false,
});

const paidLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20, // 20 paid requests per minute
  keyGenerator: (req) => {
    // Rate limit by payment signature OR IP
    const paymentHeader = req.get('X-Payment') || req.get('Payment');
    if (paymentHeader) {
      try {
        const parts = paymentHeader.split(' ');
        if (parts[1]) {
          const proof = JSON.parse(Buffer.from(parts[1], 'base64').toString());
          return proof.tx_signature || req.ip;
        }
      } catch (e) {}
    }
    return req.ip || 'unknown';
  },
  message: { error: 'Rate limit exceeded for paid requests' },
});

// Apply global rate limiter to all /v1/ routes
app.use('/v1/', globalLimiter);

/**
 * Middleware: Check authentication and payment
 */
async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const origin = req.get('origin') || req.get('referer') || '';
  const clientIp = req.ip || req.socket.remoteAddress || '';
  const apiKey = req.get('X-API-Key') || req.query.api_key;

  // 1. Check whitelist (free access for Mystery Gift apps)
  const isWhitelisted = WHITELIST.some(
    (entry) => origin.includes(entry) || clientIp.includes(entry)
  );

  if (isWhitelisted) {
    usageStats.whitelistedRequests++;
    (req as any).paymentStatus = 'whitelisted';
    return next();
  }

  // 2. Check API key (free access for authorized partners)
  if (apiKey && API_KEYS.includes(apiKey as string)) {
    (req as any).paymentStatus = 'api_key';
    return next();
  }

  // 3. Check x402 payment header
  const paymentHeader = req.get('X-Payment') || req.get('Payment');

  if (!paymentHeader) {
    res.status(402).json({
      error: 'Payment Required',
      message: 'This endpoint requires payment via x402 protocol',
      payment: {
        amount: PRICE_PER_REQUEST_CENTS,
        currency: 'USD',
        currency_decimals: 2,
        payment_methods: ['solana:usdc', 'solana:sol'],
        payment_address: process.env.PAYMENT_WALLET || 'YOUR_SOLANA_WALLET',
        x402_version: '1.0',
        description: 'TEE Attestation Request - Verifiable Randomness',
      },
      usage: {
        endpoint: '/v1/randomness',
        rate: '$0.01 per request',
      },
    });
    return;
  }

  // 4. Verify x402 payment
  try {
    const paymentValid = await verifyX402Payment(paymentHeader);

    if (!paymentValid) {
      res.status(402).json({
        error: 'Payment Invalid',
        message: 'The provided payment proof could not be verified',
      });
      return;
    }

    usageStats.paidRequests++;
    usageStats.totalRevenueCents += PRICE_PER_REQUEST_CENTS;
    (req as any).paymentStatus = 'paid';
    next();
  } catch (error) {
    console.error('[TEE] Payment verification error:', error);
    res.status(500).json({ error: 'Payment verification failed' });
  }
}

/**
 * Verify x402 payment proof
 */
async function verifyX402Payment(paymentHeader: string): Promise<boolean> {
  try {
    const parts = paymentHeader.split(' ');
    if (parts[0] !== 'x402' || !parts[1]) {
      return false;
    }

    const proofData = JSON.parse(Buffer.from(parts[1], 'base64').toString());

    if (!proofData.tx_signature || !proofData.amount || !proofData.payer) {
      return false;
    }

    // 1. Check price
    if (proofData.amount < PRICE_PER_REQUEST_CENTS) {
      return false;
    }

    // 2. Check replay attack (FIX: Add to cache BEFORE verification to prevent race condition)
    if (usedSignatures.has(proofData.tx_signature)) {
      console.warn(`[TEE] Replay attempt detected: ${proofData.tx_signature}`);
      return false;
    }
    // Mark as used immediately (atomic operation)
    usedSignatures.set(proofData.tx_signature, true);

    // 3. SECURITY: Never bypass payment verification in production
    if (TEE_TYPE === 'simulation' && RPC_PROVIDERS.length === 0) {
      if (process.env.NODE_ENV === 'production') {
        usedSignatures.delete(proofData.tx_signature); // Remove from cache
        throw new Error('RPC providers unavailable - cannot verify payments');
      }
      console.warn('[DEV] Accepting unverified payment - LOCAL DEVELOPMENT ONLY');
      return true;
    }

    // 4. Verify on-chain with fallback RPC providers
    const tx = await rpcWithFallback(
      (conn) =>
        conn.getParsedTransaction(proofData.tx_signature, {
          maxSupportedTransactionVersion: 0,
        }),
      'getParsedTransaction'
    );

    if (!tx) {
      console.warn(`[TEE] Transaction not found: ${proofData.tx_signature}`);
      usedSignatures.delete(proofData.tx_signature); // Remove from cache on failure
      return false;
    }

    if (tx.meta?.err) {
      console.warn(`[TEE] Transaction failed on-chain: ${proofData.tx_signature}`);
      usedSignatures.delete(proofData.tx_signature); // Remove from cache on failure
      return false;
    }

    // Check recency (transaction must be within last hour, not from future)
    if (tx.blockTime) {
      const now = Math.floor(Date.now() / 1000);
      const age = now - tx.blockTime;
      
      // Reject if too old (>1h) OR from future (>5min clock skew tolerance)
      if (age > 3600 || age < -300) {
        console.warn(`[TEE] Invalid transaction age: ${age}s`);
        usedSignatures.delete(proofData.tx_signature); // Remove from cache on failure
        return false;
      }
    } else {
      // For very recent txs without blockTime, check slot age
      const conn = getPrimaryConnection();
      const currentSlot = await conn.getSlot();
      const txSlot = tx.slot || 0;
      
      // Reject if older than ~80 seconds (200 slots * 400ms)
      if (currentSlot - txSlot > 200) {
        console.warn(`[TEE] Transaction slot too old: ${txSlot} vs ${currentSlot}`);
        usedSignatures.delete(proofData.tx_signature); // Remove from cache on failure
        return false;
      }
    }

    // Check transfers to verify payment amount and recipient
    // This is a simplified check - looking for SOL transfer to our wallet
    // Production should check instruction data more carefully for SPL tokens (USDC)
    const paymentWalletPubkey = new PublicKey(PAYMENT_WALLET);
    let paymentFound = false;

    // Check inner instructions (where transfers usually happen)
    // or top-level instructions
    // For MVP, we'll verify the postTokenBalances for USDC or postBalances for SOL
    // But simplistic check: did our wallet balance increase?
    // Accurate way: Parse instructions.

    // Let's check for SOL transfer first (simplest x402 implementation)
    const accountIndex = tx.transaction.message.accountKeys.findIndex(
      (k) => k.pubkey.toBase58() === PAYMENT_WALLET
    );

    if (accountIndex !== -1) {
      const preBalance = tx.meta?.preBalances[accountIndex] || 0;
      const postBalance = tx.meta?.postBalances[accountIndex] || 0;
      const diff = postBalance - preBalance;

      // 0.01 USD is roughly 0.00005 SOL (at $200/SOL)
      // Frontend sends 100,000 lamports (0.0001 SOL) -> ~$0.015-0.02
      // We enforce strict >= 100,000 lamports check
      if (diff >= 100000) {
        paymentFound = true;
      }
    }

    // If strictly checking USDC, we'd check preTokenBalances/postTokenBalances
    if (!paymentFound && tx.meta?.postTokenBalances) {
      const change = tx.meta.postTokenBalances.find(
        (b) =>
          b.owner === PAYMENT_WALLET &&
          (b.mint === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' || // Mainnet USDC
            b.mint === '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU') // Devnet USDC
      );

      if (change) {
        // We need to compare with preTokenBalances
        const preChange = tx.meta.preTokenBalances?.find(
          (b) => b.owner === PAYMENT_WALLET && b.mint === change.mint
        );

        const preAmount = preChange ? BigInt(preChange.uiTokenAmount.amount) : BigInt(0);
        const postAmount = BigInt(change.uiTokenAmount.amount);

        // 1 cent = 10000 units (6 decimals)
        if (postAmount - preAmount >= BigInt(10000)) {
          paymentFound = true;
        }
      }
    }

    if (!paymentFound) {
      console.warn(`[TEE] Payment not found in transaction: ${proofData.tx_signature}`);
      usedSignatures.delete(proofData.tx_signature); // Remove from cache on failure
      return false;
    }

    // Success! Signature already marked as used earlier (line ~290)
    return true;
  } catch (error) {
    console.error('[TEE] Payment proof verification error:', error);
    return false;
  }
}

/**
 * POST /v1/randomness
 * Returns raw 256-bit random seed with attestation
 */
app.post('/v1/randomness', paidLimiter, authMiddleware, async (req: Request, res: Response) => {
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
    const seed = randomBytes.toString('hex');

    // 2. Generate Remote Attestation (The "Proof")
    const attestation = await generateAttestation(seed, request_hash);

    // 3. Return the result
    res.json({
      random_seed: seed,
      attestation: attestation,
      timestamp: Date.now(),
      tee_type: TEE_TYPE,
      app_id: TEE_INFO.app_id,
    });
  } catch (error) {
    console.error('[TEE] Error generating randomness:', error);
    res.status(500).json({ error: 'Internal TEE Error' });
  }
});

/**
 * POST /v1/random/number
 * Returns a random integer between min and max (inclusive)
 * Body: { min?: number, max: number, request_hash?: string }
 */
app.post('/v1/random/number', paidLimiter, authMiddleware, async (req: Request, res: Response) => {
  try {
    const { min = 1, max, request_hash } = req.body;

    if (typeof max !== 'number' || max < 1) {
      res.status(400).json({ error: 'max is required and must be a positive number' });
      return;
    }

    if (min >= max) {
      res.status(400).json({ error: 'min must be less than max' });
      return;
    }

    usageStats.totalRequests++;

    // Generate random bytes
    const randomBytes = crypto.randomBytes(32);
    const seed = randomBytes.toString('hex');

    // Convert to number in range [min, max]
    const bigInt = BigInt('0x' + seed.slice(0, 16)); // Use 64 bits
    const range = BigInt(max - min + 1);
    const randomNumber = Number(bigInt % range) + min;

    const attestation = await generateAttestation(seed, request_hash || `number:${min}-${max}`);

    res.json({
      number: randomNumber,
      min,
      max,
      random_seed: seed,
      attestation,
      timestamp: Date.now(),
      tee_type: TEE_TYPE,
    });
  } catch (error) {
    console.error('[TEE] Error generating random number:', error);
    res.status(500).json({ error: 'Internal TEE Error' });
  }
});

/**
 * POST /v1/random/pick
 * Picks one random item from a provided list
 * Body: { items: any[], request_hash?: string }
 */
app.post('/v1/random/pick', paidLimiter, authMiddleware, async (req: Request, res: Response) => {
  try {
    const { items, request_hash } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'items must be a non-empty array' });
      return;
    }

    if (items.length > 100000) {
      res.status(400).json({ error: 'items array cannot exceed 100,000 elements' });
      return;
    }

    usageStats.totalRequests++;

    const randomBytes = crypto.randomBytes(32);
    const seed = randomBytes.toString('hex');

    // Pick random index
    const bigInt = BigInt('0x' + seed.slice(0, 16));
    const index = Number(bigInt % BigInt(items.length));
    const picked = items[index];

    const attestation = await generateAttestation(seed, request_hash || `pick:${items.length}`);

    res.json({
      picked,
      index,
      total_items: items.length,
      random_seed: seed,
      attestation,
      timestamp: Date.now(),
      tee_type: TEE_TYPE,
    });
  } catch (error) {
    console.error('[TEE] Error picking random item:', error);
    res.status(500).json({ error: 'Internal TEE Error' });
  }
});

/**
 * POST /v1/random/shuffle
 * Shuffles a list using Fisher-Yates algorithm with TEE randomness
 * Body: { items: any[], request_hash?: string }
 */
app.post('/v1/random/shuffle', paidLimiter, authMiddleware, async (req: Request, res: Response) => {
  try {
    const { items, request_hash } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'items must be a non-empty array' });
      return;
    }

    if (items.length > 1000) {
      res.status(400).json({ error: 'items array cannot exceed 1,000 elements for shuffle' });
      return;
    }

    usageStats.totalRequests++;

    // Generate enough random bytes for the shuffle
    const bytesNeeded = Math.ceil(items.length * 4); // 4 bytes per swap decision
    const randomBytes = crypto.randomBytes(Math.max(32, bytesNeeded));
    const seed = randomBytes.slice(0, 32).toString('hex');

    // Fisher-Yates shuffle using TEE randomness
    const shuffled = [...items];
    for (let i = shuffled.length - 1; i > 0; i--) {
      // Use 4 bytes for each random choice
      const offset = (shuffled.length - 1 - i) * 4;
      const randomValue = randomBytes.readUInt32BE(offset % randomBytes.length);
      const j = randomValue % (i + 1);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const attestation = await generateAttestation(seed, request_hash || `shuffle:${items.length}`);

    res.json({
      shuffled,
      original_count: items.length,
      random_seed: seed,
      attestation,
      timestamp: Date.now(),
      tee_type: TEE_TYPE,
    });
  } catch (error) {
    console.error('[TEE] Error shuffling items:', error);
    res.status(500).json({ error: 'Internal TEE Error' });
  }
});

/**
 * POST /v1/random/winners
 * Pick multiple unique winners from a list
 * Body: { items: any[], count: number, request_hash?: string }
 */
app.post('/v1/random/winners', paidLimiter, authMiddleware, async (req: Request, res: Response) => {
  try {
    const { items, count = 1, request_hash } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'items must be a non-empty array' });
      return;
    }

    if (typeof count !== 'number' || count < 1) {
      res.status(400).json({ error: 'count must be a positive number' });
      return;
    }

    if (count > items.length) {
      res.status(400).json({ error: 'count cannot exceed the number of items' });
      return;
    }

    if (items.length > 100000) {
      res.status(400).json({ error: 'items array cannot exceed 100,000 elements' });
      return;
    }

    usageStats.totalRequests++;

    // Generate enough randomness for selecting winners
    const bytesNeeded = Math.ceil(count * 8);
    const randomBytes = crypto.randomBytes(Math.max(32, bytesNeeded));
    const seed = randomBytes.slice(0, 32).toString('hex');

    // Select unique winners using reservoir-like sampling
    const indices = new Set<number>();
    const winners: any[] = [];
    let attempts = 0;
    const maxAttempts = count * 10;

    while (winners.length < count && attempts < maxAttempts) {
      const offset = (attempts * 8) % randomBytes.length;
      const randomValue = Number(randomBytes.readBigUInt64BE(offset) % BigInt(items.length));

      if (!indices.has(randomValue)) {
        indices.add(randomValue);
        winners.push({
          item: items[randomValue],
          index: randomValue,
          position: winners.length + 1,
        });
      }
      attempts++;
    }

    const attestation = await generateAttestation(
      seed,
      request_hash || `winners:${count}of${items.length}`
    );

    res.json({
      winners,
      count: winners.length,
      total_items: items.length,
      random_seed: seed,
      attestation,
      timestamp: Date.now(),
      tee_type: TEE_TYPE,
    });
  } catch (error) {
    console.error('[TEE] Error selecting winners:', error);
    res.status(500).json({ error: 'Internal TEE Error' });
  }
});

/**
 * POST /v1/random/uuid
 * Generates a cryptographically secure UUIDv4
 * Body: { request_hash?: string }
 */
app.post('/v1/random/uuid', paidLimiter, authMiddleware, async (req: Request, res: Response) => {
  try {
    const { request_hash } = req.body;

    usageStats.totalRequests++;

    const randomBytes = crypto.randomBytes(32);
    const seed = randomBytes.toString('hex');

    // Generate UUIDv4 from random bytes
    const uuidBytes = randomBytes.slice(0, 16);
    uuidBytes[6] = (uuidBytes[6] & 0x0f) | 0x40; // Version 4
    uuidBytes[8] = (uuidBytes[8] & 0x3f) | 0x80; // Variant 1

    const uuid = [
      uuidBytes.slice(0, 4).toString('hex'),
      uuidBytes.slice(4, 6).toString('hex'),
      uuidBytes.slice(6, 8).toString('hex'),
      uuidBytes.slice(8, 10).toString('hex'),
      uuidBytes.slice(10, 16).toString('hex'),
    ].join('-');

    const attestation = await generateAttestation(seed, request_hash || `uuid`);

    res.json({
      uuid,
      random_seed: seed,
      attestation,
      timestamp: Date.now(),
      tee_type: TEE_TYPE,
    });
  } catch (error) {
    console.error('[TEE] Error generating UUID:', error);
    res.status(500).json({ error: 'Internal TEE Error' });
  }
});

/**
 * POST /v1/random/dice
 * Roll dice (e.g., 2d6, 1d20)
 * Body: { dice: string (e.g., "2d6"), request_hash?: string }
 */
app.post('/v1/random/dice', paidLimiter, authMiddleware, async (req: Request, res: Response) => {
  try {
    const { dice, request_hash } = req.body;

    if (typeof dice !== 'string') {
      res.status(400).json({ error: 'dice must be a string (e.g., "2d6", "1d20")' });
      return;
    }

    const match = dice.toLowerCase().match(/^(\d+)d(\d+)$/);
    if (!match) {
      res.status(400).json({ error: 'Invalid dice format. Use "NdM" (e.g., "2d6", "1d20")' });
      return;
    }

    const numDice = parseInt(match[1], 10);
    const sides = parseInt(match[2], 10);

    if (numDice < 1 || numDice > 100) {
      res.status(400).json({ error: 'Number of dice must be between 1 and 100' });
      return;
    }

    if (sides < 2 || sides > 1000) {
      res.status(400).json({ error: 'Dice sides must be between 2 and 1000' });
      return;
    }

    usageStats.totalRequests++;

    const randomBytes = crypto.randomBytes(Math.max(32, numDice * 4));
    const seed = randomBytes.slice(0, 32).toString('hex');

    const rolls: number[] = [];
    for (let i = 0; i < numDice; i++) {
      const value = randomBytes.readUInt32BE((i * 4) % randomBytes.length);
      rolls.push((value % sides) + 1);
    }

    const total = rolls.reduce((a, b) => a + b, 0);
    const attestation = await generateAttestation(seed, request_hash || `dice:${dice}`);

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
    });
  } catch (error) {
    console.error('[TEE] Error rolling dice:', error);
    res.status(500).json({ error: 'Internal TEE Error' });
  }
});

/**
 * GET /v1/health
 */
app.get('/v1/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    tee_type: TEE_TYPE,
    version: VERSION,
    x402_enabled: true,
    price_per_request: `$${(PRICE_PER_REQUEST_CENTS / 100).toFixed(2)}`,
    app_id: TEE_INFO.app_id,
    verification_available: TEE_TYPE === 'tdx',
    endpoints: [
      'POST /v1/randomness - Raw 256-bit seed',
      'POST /v1/random/number - Random number in range',
      'POST /v1/random/pick - Pick one from list',
      'POST /v1/random/shuffle - Shuffle a list',
      'POST /v1/random/winners - Pick multiple winners',
      'POST /v1/random/uuid - Generate UUIDv4',
      'POST /v1/random/dice - Roll dice (e.g., 2d6)',
    ],
  });
});

/**
 * GET /v1/stats
 */
app.get('/v1/stats', (req: Request, res: Response) => {
  const apiKey = req.get('X-API-Key') || req.query.api_key;

  if (!apiKey || !API_KEYS.includes(apiKey as string)) {
    res.status(401).json({ error: 'Unauthorized' });
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
 * Redesigned v2.8 - Refined Hybrid with Fixes (Parallax, Footer, Layout)
 */
app.get('/', (_req: Request, res: Response) => {
  const appId = TEE_INFO.app_id;
  const composeHash = TEE_INFO.compose_hash || 'Loading...';
  const nodeUrl = `https://${appId}-8090.dstack-pha-prod5.phala.network/`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>MYSTERY GIFT | TEE NODE v${VERSION}</title>
  
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Sometype+Mono:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap" rel="stylesheet">
  
  <script src="https://code.iconify.design/iconify-icon/1.0.7/iconify-icon.min.js"></script>
  <script src="https://unpkg.com/@solana/web3.js@latest/lib/index.iife.min.js"></script>

  <style>
    :root {
      --bg: #09090b;
      --panel-bg: rgba(20, 20, 23, 0.75);
      --panel-border: rgba(255, 255, 255, 0.08);
      --text-main: #FAFAFA;
      --text-muted: #A1A1AA;
      --accent: #FF4D00;
      --accent-glow: rgba(255, 77, 0, 0.2);
      --success: #34D399;
      --font: 'Sometype Mono', monospace;
      
      /* Cyberpunk Clip Path for the special button */
      --clip-cyber: polygon(
        10px 0, 100% 0, 
        100% calc(100% - 10px), calc(100% - 10px) 100%, 
        0 100%, 0 10px
      );
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: var(--font);
      background-color: var(--bg);
      color: var(--text-main);
      height: 100vh;
      width: 100vw;
      overflow: hidden;
    }

    /* Layout */
    .layout {
      display: grid;
      grid-template-columns: 1fr 450px;
      height: 100vh;
      width: 100%;
      overflow: hidden; /* Prevent full page scroll */
    }

    /* Left Hero */
    .hero {
      position: relative;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      align-items: center;
      overflow: hidden;
      background-color: var(--bg);
      /* Subtle Question Mark Texture - NO Grid */
      background-image: url("data:image/svg+xml,%3Csvg width='400' height='400' viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cstyle%3Etext { font-family: monospace; fill: %23ffffff; opacity: 0.02; font-weight: bold; user-select: none; }%3C/style%3E%3Ctext x='50' y='80' font-size='120' transform='rotate(15 50,80)'%3E?%3C/text%3E%3Ctext x='300' y='150' font-size='80' transform='rotate(-20 300,150)'%3E?%3C/text%3E%3Ctext x='150' y='300' font-size='160' transform='rotate(10 150,300)'%3E?%3C/text%3E%3Ctext x='350' y='350' font-size='60' transform='rotate(30 350,350)'%3E?%3C/text%3E%3Ctext x='100' y='200' font-size='40' opacity='0.04' transform='rotate(-45 100,200)'%3E?%3C/text%3E%3Ctext x='250' y='50' font-size='90' transform='rotate(5 250,50)'%3E?%3C/text%3E%3Ctext x='20' y='380' font-size='70' transform='rotate(-15 20,380)'%3E?%3C/text%3E%3C/svg%3E");
      transition: background-position 0.1s linear;
    }

    /* Hero Wallet Button */
    .wallet-container-hero {
      position: absolute;
      top: 1.5rem;
      right: 1.5rem;
      z-index: 100;
    }

    .miss-container {
      position: absolute;
      bottom: -80px; /* Anchor below viewport so bottom is never fully visible */
      left: 0;
      right: 0;
      z-index: 10;
      height: 90vh;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      transition: transform 0.1s linear;
    }

    .miss-img {
      height: 100%;
      max-height: 900px;
      object-fit: contain;
      object-position: bottom center;
      filter: drop-shadow(0 0 60px rgba(0,0,0,0.6));
      /* Flip image horizontally handled in JS/CSS together */
      transform: scaleX(-1);
    }

    .hero-info {
      position: absolute;
      bottom: 3rem;
      left: 3.5rem;
      z-index: 20;
      max-width: 600px;
    }

    h1 {
      font-size: 3.5rem;
      font-weight: 700;
      line-height: 0.9;
      letter-spacing: -0.04em;
      text-transform: uppercase;
      color: var(--text-main);
      margin-bottom: 0.8rem;
      text-shadow: 0 10px 30px rgba(0,0,0,0.8);
    }
    
    .subtitle {
      font-size: 1rem;
      color: var(--accent);
      font-weight: 600;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .subtitle::before {
      content: '';
      display: block;
      width: 40px;
      height: 2px;
      background: var(--accent);
    }

    .version-tag {
      position: absolute;
      bottom: 2rem;
      right: 2rem;
      font-size: 0.75rem;
      color: var(--text-muted);
      opacity: 0.5;
      font-weight: 600;
      z-index: 20;
    }

    /* Right Panel - Glassmorphism */
    .panel {
      background: var(--panel-bg);
      border-left: 1px solid var(--panel-border);
      backdrop-filter: blur(30px);
      -webkit-backdrop-filter: blur(30px);
      display: flex;
      flex-direction: column;
      position: relative;
      z-index: 50;
      height: 100vh; /* Strictly full height */
    }

    .wallet-btn {
      background: rgba(0,0,0,0.4);
      color: var(--text-main);
      border: 1px solid var(--panel-border);
      padding: 0.7rem 1.2rem;
      border-radius: 8px;
      font-family: var(--font);
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 0.6rem;
      transition: all 0.2s;
    }

    .wallet-btn:hover {
      background: rgba(255,255,255,0.08);
      border-color: rgba(255,255,255,0.2);
    }

    .wallet-btn.connected {
      background: rgba(52, 211, 153, 0.1);
      border-color: rgba(52, 211, 153, 0.3);
      color: var(--success);
    }

    /* Tabs */
    .tabs {
      display: flex;
      gap: 0.2rem;
      padding: 0.5rem 2rem 0;
      margin-bottom: 1.5rem;
      border-bottom: 1px solid var(--panel-border);
      flex-shrink: 0; 
    }

    .tab-btn {
      padding: 0.8rem 1.2rem;
      background: transparent;
      color: var(--text-muted);
      border: none;
      font-family: var(--font);
      font-weight: 500;
      font-size: 0.85rem;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      transition: all 0.2s;
    }

    .tab-btn.active {
      color: var(--text-main);
      border-bottom-color: var(--accent);
    }

    .tab-btn:hover:not(.active) {
      color: var(--text-main);
    }

    /* Content Area */
    .content-wrapper {
      flex: 1; /* Take remaining space */
      overflow-y: auto; /* Scroll inside panel only */
      padding: 0 1.5rem 1.5rem;
      display: flex;
      flex-direction: column;
    }

    /* Sleek Scrollbar */
    .content-wrapper::-webkit-scrollbar {
      width: 4px;
    }
    .content-wrapper::-webkit-scrollbar-track {
      background: transparent;
    }
    .content-wrapper::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.1);
      border-radius: 4px;
    }
    .content-wrapper::-webkit-scrollbar-thumb:hover {
      background: rgba(255, 255, 255, 0.2);
    }

    .tab-view { display: none; width: 100%; }
    .tab-view.active { display: block; animation: fadeIn 0.3s ease; }

    .card {
      background: rgba(0, 0, 0, 0.3);
      border: 1px solid var(--panel-border);
      border-radius: 12px;
      padding: 1.2rem;
      margin-bottom: 1.5rem;
    }

    .card-label {
      font-size: 0.75rem;
      color: var(--text-muted);
      text-transform: uppercase;
      margin-bottom: 0.8rem;
      display: block;
      font-weight: 600;
      letter-spacing: 0.05em;
    }

    /* Form Controls */
    .sleek-input {
      width: 100%;
      padding: 0.9rem;
      background: rgba(0,0,0,0.4);
      color: var(--text-main);
      border: 1px solid var(--panel-border);
      border-radius: 8px;
      font-family: var(--font);
      font-size: 0.9rem;
      margin-bottom: 1rem;
      outline: none;
      transition: all 0.2s;
    }

    /* Custom Sleek Select - Cyberpunk Style */
    .sleek-select {
      display: none; /* Hide native select, use custom dropdown */
    }
    
    /* Custom Dropdown */
    .custom-dropdown {
      position: relative;
      width: 100%;
      margin-bottom: 1rem;
      font-family: var(--font);
    }
    
    .dropdown-selected {
      width: 100%;
      padding: 0.9rem 2.5rem 0.9rem 0.9rem;
      background-color: rgba(0,0,0,0.5);
      color: var(--text-main);
      border: 1px solid var(--panel-border);
      border-radius: 8px;
      font-family: var(--font);
      font-size: 0.9rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
      position: relative;
    }
    
    .dropdown-selected::after {
      content: '';
      position: absolute;
      right: 12px;
      top: 50%;
      transform: translateY(-50%);
      width: 16px;
      height: 16px;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24'%3E%3Cpath fill='%23FF4D00' d='M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z'/%3E%3C/svg%3E");
      background-size: contain;
      transition: transform 0.2s ease;
    }
    
    .custom-dropdown.open .dropdown-selected::after {
      transform: translateY(-50%) rotate(180deg);
    }
    
    .dropdown-selected:hover {
      border-color: rgba(255, 255, 255, 0.2);
      background-color: rgba(0,0,0,0.6);
    }
    
    .custom-dropdown.open .dropdown-selected {
      border-color: var(--accent);
      background-color: rgba(0,0,0,0.7);
      box-shadow: 0 0 0 2px var(--accent-glow);
      border-radius: 8px 8px 0 0;
    }
    
    .dropdown-options {
      display: none;
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      background-color: #141417;
      border: 1px solid var(--accent);
      border-top: none;
      border-radius: 0 0 8px 8px;
      overflow: hidden;
      z-index: 100;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    }
    
    .custom-dropdown.open .dropdown-options {
      display: block;
      animation: dropdownFadeIn 0.2s ease;
    }
    
    .dropdown-option {
      padding: 0.9rem;
      color: var(--text-muted);
      cursor: pointer;
      transition: all 0.15s ease;
      border-bottom: 1px solid rgba(255,255,255,0.05);
      font-size: 0.9rem;
    }
    
    .dropdown-option:last-child {
      border-bottom: none;
    }
    
    .dropdown-option:hover {
      background-color: rgba(255, 77, 0, 0.15);
      color: var(--text-main);
      padding-left: 1.2rem;
    }
    
    .dropdown-option.selected {
      background-color: var(--accent);
      color: white;
    }
    
    @keyframes dropdownFadeIn {
      from { opacity: 0; transform: translateY(-5px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .sleek-input:focus {
      border-color: var(--accent);
      background-color: rgba(0,0,0,0.6);
    }

    /* Cyberpunk Button */
    .cyber-btn {
      width: 100%;
      padding: 1.4rem;
      background: var(--text-main);
      color: #000;
      border: none;
      font-family: var(--font);
      font-weight: 700;
      text-transform: uppercase;
      cursor: pointer;
      clip-path: var(--clip-cyber);
      transition: all 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.6rem;
      font-size: 1rem;
      margin-top: 1rem;
      position: relative;
      overflow: hidden;
    }

    .cyber-btn:hover {
      background: var(--accent);
      color: white;
      text-shadow: 0 1px 2px rgba(0,0,0,0.2);
      transform: translateY(-1px);
    }

    .cyber-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      background: var(--text-muted);
      transform: none;
    }

    .cyber-btn::before {
      content: '';
      position: absolute;
      top: 0; left: -100%;
      width: 100%; height: 100%;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent);
      transition: 0.5s;
    }

    .cyber-btn:hover::before {
      left: 100%;
    }

    /* Standard Button */
    .std-btn {
      width: 100%;
      padding: 0.9rem;
      background: rgba(255,255,255,0.05);
      border: 1px solid var(--panel-border);
      border-radius: 8px;
      color: var(--text-main);
      font-family: var(--font);
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }

    .std-btn:hover {
      background: rgba(255,255,255,0.1);
      border-color: var(--text-main);
    }

    /* Toggles */
    .toggle-group {
      display: flex;
      background: rgba(0,0,0,0.4);
      padding: 4px;
      border-radius: 8px;
      margin-bottom: 1.5rem;
    }

    .toggle-opt {
      flex: 1;
      padding: 0.6rem;
      border: none;
      background: transparent;
      color: var(--text-muted);
      border-radius: 6px;
      font-size: 0.8rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      font-family: var(--font); /* Monospace Fix */
    }

    .toggle-opt.active {
      background: rgba(255,255,255,0.1);
      color: var(--text-main);
      box-shadow: 0 1px 3px rgba(0,0,0,0.2);
    }

    /* Footer (Console + Copy) */
    .footer-spacer {
      margin-top: auto; /* Push footer to bottom of content if short */
    }

    .console-bar {
      background: #050505;
      border-top: 1px solid var(--panel-border);
      color: var(--text-muted);
      font-family: monospace;
      font-size: 0.75rem;
      cursor: pointer;
      transition: height 0.3s ease;
      height: 34px; /* Minimized height */
      overflow: hidden;
      flex-shrink: 0;
    }

    .console-header {
      padding: 0.6rem 2rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      background: rgba(255,255,255,0.02);
    }

    .console-indicator {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--success);
      box-shadow: 0 0 5px var(--success);
    }

    .console-content {
      padding: 0 2rem 1rem;
      overflow-y: auto;
      height: 160px; /* Expanded content height */
    }

    .console-bar.expanded {
      height: 200px;
    }

    .legal-footer {
      padding: 1rem 2rem;
      font-size: 0.7rem;
      color: var(--text-muted);
      text-align: center;
      border-top: 1px solid var(--panel-border);
      background: var(--panel-bg);
      flex-shrink: 0;
    }

    .log-line { margin-bottom: 4px; }
    .log-success { color: var(--success); }
    .log-error { color: #F87171; }
    .log-info { color: #A5B4FC; }

    .hash-display {
      font-family: monospace;
      font-size: 0.75rem;
      color: var(--text-muted);
      word-break: break-all;
      background: rgba(0,0,0,0.4);
      padding: 1rem;
      border-radius: 8px;
      border: 1px solid var(--panel-border);
    }

    /* Mobile */
    @media (max-width: 1024px) {
      .layout { grid-template-columns: 1fr; grid-template-rows: auto 1fr; height: auto; overflow-y: auto; }
      
      .hero { 
        height: 50vh; 
        min-height: 400px;
        border-bottom: 1px solid var(--panel-border);
        justify-content: flex-end;
      }

      .miss-img {
        max-height: 450px;
      }

      /* Fix Mobile Positioning */
      .hero-info {
        top: auto;
        bottom: 2rem;
        left: 1.5rem;
        max-width: 80%;
      }
      
      .wallet-container-hero {
        top: 1.5rem;
        right: 1.5rem;
      }

      h1 { font-size: 2rem; }
      
      .panel { 
        min-height: 60vh;
        height: auto;
        overflow: visible;
      }
      
      .content-wrapper { padding: 0 1.5rem 2rem; }
      .console-bar { display: none; } /* Hide console on mobile to save space */
    }
    
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(5px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* Receipt Modal Styles */
    .receipt-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.85);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      display: none;
      justify-content: center;
      align-items: center;
      z-index: 1000;
      padding: 1rem;
    }

    .receipt-overlay.visible {
      display: flex;
      animation: fadeIn 0.3s ease;
    }

    .receipt-modal {
      background: var(--panel-bg);
      border: 1px solid var(--panel-border);
      border-radius: 16px;
      max-width: 480px;
      width: 100%;
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5);
    }

    .receipt-header {
      padding: 1.5rem 2rem;
      background: linear-gradient(135deg, rgba(52, 211, 153, 0.15) 0%, rgba(52, 211, 153, 0.05) 100%);
      border-bottom: 1px solid rgba(52, 211, 153, 0.2);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .receipt-header h3 {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      font-size: 1rem;
      font-weight: 600;
      color: var(--success);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .receipt-close {
      background: transparent;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      font-size: 1.5rem;
      line-height: 1;
      padding: 0.25rem;
      transition: color 0.2s;
    }

    .receipt-close:hover {
      color: var(--text-main);
    }

    .receipt-section {
      padding: 1.25rem 2rem;
      border-bottom: 1px solid var(--panel-border);
    }

    .receipt-section:last-child {
      border-bottom: none;
    }

    .receipt-section-title {
      font-size: 0.7rem;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.1em;
      margin-bottom: 0.8rem;
    }

    .receipt-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 0.5rem;
      gap: 1rem;
    }

    .receipt-row:last-child {
      margin-bottom: 0;
    }

    .receipt-label {
      font-size: 0.8rem;
      color: var(--text-muted);
      flex-shrink: 0;
    }

    .receipt-value {
      font-size: 0.8rem;
      color: var(--text-main);
      text-align: right;
      word-break: break-all;
      font-family: monospace;
    }

    .receipt-value.highlight {
      color: var(--accent);
      font-weight: 600;
    }

    .receipt-value.success {
      color: var(--success);
    }

    .receipt-link {
      color: var(--accent);
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      font-size: 0.8rem;
    }

    .receipt-link:hover {
      text-decoration: underline;
    }

    .receipt-result {
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--accent);
      text-align: center;
      padding: 1rem 0;
      font-family: var(--font);
    }

    .receipt-actions {
      display: flex;
      gap: 0.75rem;
      padding: 1.5rem 2rem;
      background: rgba(0, 0, 0, 0.2);
    }

    .receipt-btn {
      flex: 1;
      padding: 0.75rem 1rem;
      border-radius: 8px;
      font-family: var(--font);
      font-size: 0.75rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.4rem;
    }

    .receipt-btn-primary {
      background: var(--accent);
      color: white;
      border: none;
    }

    .receipt-btn-primary:hover {
      background: #ff6a33;
    }

    .receipt-btn-secondary {
      background: transparent;
      color: var(--text-main);
      border: 1px solid var(--panel-border);
    }

    .receipt-btn-secondary:hover {
      background: rgba(255, 255, 255, 0.05);
    }

    .toast {
      position: fixed;
      bottom: 2rem;
      left: 50%;
      transform: translateX(-50%) translateY(100px);
      background: var(--success);
      color: #000;
      padding: 0.75rem 1.5rem;
      border-radius: 8px;
      font-size: 0.85rem;
      font-weight: 600;
      z-index: 2000;
      opacity: 0;
      transition: all 0.3s ease;
    }

    .toast.visible {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }

    .verification-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.4rem 0.8rem;
      background: rgba(52, 211, 153, 0.15);
      border: 1px solid rgba(52, 211, 153, 0.3);
      border-radius: 6px;
      font-size: 0.75rem;
      color: var(--success);
      font-weight: 500;
    }
  </style>
</head>
<body>
  <div class="layout">
    <!-- Hero -->
    <div class="hero" id="hero-section">
      
      <div class="wallet-container-hero">
        <button class="wallet-btn" id="connect-btn" onclick="toggleWallet()">
          <iconify-icon icon="ph:wallet-fill"></iconify-icon> CONNECT WALLET
        </button>
      </div>

      <div class="hero-info">
        <h1>VERIFIABLE<br>RANDOMNESS<br>SERVICE</h1>
        <div class="subtitle">POWERED BY INTEL TDX</div>
      </div>

      <div class="miss-container" id="miss-container">
        <img src="/assets/miss.png" class="miss-img" alt="Miss">
      </div>

      <a href="/changelog" class="version-tag" style="text-decoration:none; cursor:pointer;">v${VERSION} • ${composeHash.slice(0, 8)}</a>
    </div>

    <!-- Panel -->
    <div class="panel">
      <!-- Tabs -->
      <div class="tabs">
        <button class="tab-btn active" onclick="nav('run')" id="t-run">EXECUTE</button>
        <button class="tab-btn" onclick="nav('verify')" id="t-verify">AUDIT</button>
        <button class="tab-btn" onclick="nav('guide')" id="t-guide">GUIDE</button>
        <button class="tab-btn" onclick="nav('api')" id="t-api">API</button>
        <button class="tab-btn" onclick="nav('info')" id="t-info">INFO</button>
      </div>

      <!-- Content -->
      <div class="content-wrapper">
        
        <!-- RUN -->
        <div id="v-run" class="tab-view active">
          <div class="card">
            <span class="card-label">Operation Type</span>
            <div class="custom-dropdown" id="op-dropdown">
              <div class="dropdown-selected" onclick="toggleDropdown()">Raw Randomness (Seed)</div>
              <div class="dropdown-options">
                <div class="dropdown-option selected" data-value="randomness">Raw Randomness (Seed)</div>
                <div class="dropdown-option" data-value="number">Random Number</div>
                <div class="dropdown-option" data-value="dice">Roll Dice</div>
                <div class="dropdown-option" data-value="pick">Pick Winner</div>
              </div>
            </div>
            <input type="hidden" id="op-type" value="randomness">
            
            <div id="inputs-number" style="display:none">
              <input type="number" class="sleek-input" id="in-min" placeholder="Min Value (Default: 1)">
              <input type="number" class="sleek-input" id="in-max" placeholder="Max Value (Default: 100)">
            </div>
            
            <div id="inputs-dice" style="display:none">
              <input type="text" class="sleek-input" id="in-dice" placeholder="Format: 2d6, 1d20">
            </div>
            
            <div id="inputs-pick" style="display:none">
              <input type="text" class="sleek-input" id="in-items" placeholder="Items (Comma separated)">
            </div>
          </div>

          <div class="card">
            <span class="card-label">Configuration</span>
            
            <div style="margin-bottom:0.5rem; font-size:0.75rem; color:var(--text-muted);">Payment</div>
            <div class="toggle-group">
              <button class="toggle-opt active" id="pay-usdc" onclick="setPay('usdc')"><iconify-icon icon="token:usdc" style="vertical-align:middle; margin-right:4px;"></iconify-icon>USDC ($0.01)</button>
              <button class="toggle-opt" id="pay-sol" onclick="setPay('sol')"><iconify-icon icon="token:sol" style="vertical-align:middle; margin-right:4px;"></iconify-icon>SOL (~0.015)</button>
            </div>
          </div>

          <!-- CYBERPUNK BUTTON -->
          <button class="cyber-btn" id="gen-btn" onclick="generate()" disabled>
            <iconify-icon icon="ph:lightning-fill"></iconify-icon> INITIALIZE RANDOMNESS
          </button>
        </div>

        <!-- VERIFY -->
        <div id="v-verify" class="tab-view">
          <div class="card">
            <span class="card-label">System Identity</span>
            <div class="hash-display" style="margin-bottom: 1rem;">APP_ID: ${appId}</div>
            
            <span class="card-label">Integrity Hash</span>
            <div class="hash-display" id="compose-hash">${composeHash}</div>
          </div>

          <button class="std-btn" onclick="verify()" id="verify-btn">
            Verify Attestation Signature
          </button>
          
          <div id="verify-res" style="margin-top:1rem; display:none;"></div>
        </div>

        <!-- INFO -->
        <div id="v-info" class="tab-view">
          <div class="card">
            <span class="card-label">Overview</span>
            <p style="font-size:0.85rem; color:var(--text-muted); line-height:1.5;">
              Intel TDX powered verifiable randomness. Secure, hardware-enforced generation with remote attestation proofs.
            </p>
          </div>

          <div class="card" style="border-color: var(--accent-glow);">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span class="card-label" style="color:var(--accent); margin-bottom:0;">Pricing</span>
              <div style="font-size:1.2rem; font-weight:700; color:var(--text-main);">$0.01 <span style="font-size:0.8rem; color:var(--text-muted);">/ req</span></div>
            </div>
            <div style="margin-top:0.8rem; font-size:0.8rem; color:var(--text-muted);">
              Pay via x402 (USDC/SOL) &bull; 90% cheaper than Chainlink VRF
            </div>
          </div>

          <div class="card">
            <span class="card-label">Use Cases</span>
            <p style="font-size:0.8rem; color:var(--text-muted); margin:0;">
              NFT Mints &bull; Gacha / Loot &bull; Casino Games &bull; Tournaments &bull; PvP Selection
            </p>
          </div>
        </div>

        <!-- GUIDE -->
        <div id="v-guide" class="tab-view">
          <div class="card">
            <span class="card-label">Quick Start</span>
            <div style="font-size:0.85rem; color:var(--text-muted); line-height:1.8;">
              <div style="margin-bottom:0.8rem; display:flex; gap:10px;">
                <span style="color:var(--accent); font-weight:700;">1.</span>
                <span>Connect your Solana wallet (Phantom recommended)</span>
              </div>
              <div style="margin-bottom:0.8rem; display:flex; gap:10px;">
                <span style="color:var(--accent); font-weight:700;">2.</span>
                <span>Select operation type and configure parameters</span>
              </div>
              <div style="margin-bottom:0.8rem; display:flex; gap:10px;">
                <span style="color:var(--accent); font-weight:700;">3.</span>
                <span>Choose payment method (USDC or SOL)</span>
              </div>
              <div style="display:flex; gap:10px;">
                <span style="color:var(--accent); font-weight:700;">4.</span>
                <span>Click "Initialize Randomness" and approve the transaction</span>
              </div>
            </div>
          </div>

          <div class="card">
            <span class="card-label">Operations</span>
            <div style="font-size:0.8rem; color:var(--text-muted); line-height:1.7;">
              <div style="margin-bottom:0.6rem;">
                <strong style="color:var(--text-main);">Raw Randomness</strong> - 256-bit cryptographic seed
              </div>
              <div style="margin-bottom:0.6rem;">
                <strong style="color:var(--text-main);">Random Number</strong> - Integer within min/max range
              </div>
              <div style="margin-bottom:0.6rem;">
                <strong style="color:var(--text-main);">Roll Dice</strong> - Simulate dice rolls (e.g., 2d6, 1d20)
              </div>
              <div>
                <strong style="color:var(--text-main);">Pick Winner</strong> - Select from comma-separated list
              </div>
            </div>
          </div>

          <div class="card">
            <span class="card-label">What is x402?</span>
            <p style="font-size:0.85rem; color:var(--text-muted); line-height:1.6; margin-bottom:0.5rem;">
              Open standard for machine-to-machine payments via HTTP 402 headers. Enables instant, permissionless payments on Solana.
            </p>
            <a href="https://www.x402.org" target="_blank" style="font-size:0.8rem; color:var(--accent);">Learn more &rarr;</a>
          </div>

          <div class="card">
            <span class="card-label">Verification</span>
            <p style="font-size:0.85rem; color:var(--text-muted); line-height:1.6;">
              Each response includes a TEE attestation. Use the <strong style="color:var(--text-main);">AUDIT</strong> tab to verify the hardware signature and confirm the randomness was generated in a genuine Intel TDX enclave.
            </p>
          </div>
        </div>

        <!-- API -->
        <div id="v-api" class="tab-view">
          <div class="card">
            <span class="card-label">API Endpoints (POST)</span>
            <div class="hash-display" style="margin-bottom:0.5rem">/v1/randomness</div>
            <div class="hash-display" style="margin-bottom:0.5rem">/v1/random/pick</div>
            <div class="hash-display" style="margin-bottom:0.5rem">/v1/random/dice</div>
            <div class="hash-display">/v1/random/uuid</div>
          </div>
          
          <div class="card">
            <span class="card-label">Developer Resources</span>
            <a href="https://github.com/mysterygift/mystery-gift" target="_blank" style="text-decoration:none">
              <button class="std-btn" style="margin-bottom:0.8rem;">
                <iconify-icon icon="ph:github-logo-fill" style="vertical-align:text-bottom; margin-right:4px;"></iconify-icon> View Source Code
              </button>
            </a>

            <a href="${nodeUrl}" target="_blank" style="text-decoration:none; display:block;">
              <button class="std-btn" style="background:rgba(52, 211, 153, 0.05); border-color:rgba(52, 211, 153, 0.2); color:var(--success);">
                <iconify-icon icon="ph:activity-bold" style="vertical-align:text-bottom; margin-right:4px;"></iconify-icon>
                View Node Status
              </button>
            </a>
          </div>
        </div>

      </div>

      <!-- Console Footer -->
      <div class="console-bar" id="console-bar" onclick="toggleConsole()">
        <div class="console-header">
          <div class="console-indicator" id="status-dot"></div>
          <span id="status-text">System Ready</span>
          <div style="flex:1"></div>
          <iconify-icon icon="ph:caret-up-bold" id="console-chevron"></iconify-icon>
        </div>
        <div class="console-content" id="console">
          <div class="log-line">> Initializing TEE environment...</div>
          <div class="log-line">> Secure Enclave: Intel TDX</div>
          <div class="log-line">> Remote Attestation: Enabled</div>
        </div>
      </div>

      <div class="legal-footer">
        &copy; 2026 MYSTERY GIFT &bull; <a href="/terms" style="color:var(--text-muted)">Terms</a> &bull; <a href="/privacy" style="color:var(--text-muted)">Privacy</a> &bull; <a href="https://x.com/mysterygift_fun" target="_blank" style="color:var(--text-muted)">X</a>
      </div>
    </div>
  </div>

  <script>
    // Logic
    let pay = 'usdc';
    let wallet = null;
    let consoleExpanded = false;

    // Custom Dropdown Logic
    function toggleDropdown() {
      const dropdown = document.getElementById('op-dropdown');
      dropdown.classList.toggle('open');
    }
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      const dropdown = document.getElementById('op-dropdown');
      if (dropdown && !dropdown.contains(e.target)) {
        dropdown.classList.remove('open');
      }
    });
    
    // Initialize dropdown option clicks
    document.addEventListener('DOMContentLoaded', () => {
      document.querySelectorAll('.dropdown-option').forEach(opt => {
        opt.addEventListener('click', (e) => {
          const dropdown = e.target.closest('.custom-dropdown');
          const selected = dropdown.querySelector('.dropdown-selected');
          const hiddenInput = document.getElementById('op-type');
          
          // Update UI
          dropdown.querySelectorAll('.dropdown-option').forEach(o => o.classList.remove('selected'));
          e.target.classList.add('selected');
          selected.textContent = e.target.textContent;
          hiddenInput.value = e.target.dataset.value;
          
          // Close dropdown
          dropdown.classList.remove('open');
          
          // Trigger update
          updateInputs();
        });
      });
    });

    function nav(tab) {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-view').forEach(v => v.classList.remove('active'));
      document.getElementById('t-'+tab).classList.add('active');
      document.getElementById('v-'+tab).classList.add('active');
    }

    function setPay(p) {
      pay = p;
      document.getElementById('pay-usdc').classList.toggle('active', p === 'usdc');
      document.getElementById('pay-sol').classList.toggle('active', p === 'sol');
    }

    function updateInputs() {
      const type = document.getElementById('op-type').value;
      document.getElementById('inputs-number').style.display = type === 'number' ? 'block' : 'none';
      document.getElementById('inputs-dice').style.display = type === 'dice' ? 'block' : 'none';
      document.getElementById('inputs-pick').style.display = type === 'pick' ? 'block' : 'none';
    }

    function log(msg, type='info') {
      const t = document.getElementById('console');
      const d = document.createElement('div');
      d.className = 'log-line ' + (type==='success'?'log-success':type==='error'?'log-error':'log-info');
      d.innerText = '> ' + msg;
      t.appendChild(d);
      t.scrollTop = t.scrollHeight;
      
      // Update status bar text
      document.getElementById('status-text').innerText = msg;
      const dot = document.getElementById('status-dot');
      dot.style.background = type==='success' ? 'var(--success)' : type==='error' ? '#F87171' : 'var(--text-muted)';
      dot.style.boxShadow = type==='success' ? '0 0 5px var(--success)' : 'none';
    }

    function toggleConsole() {
      consoleExpanded = !consoleExpanded;
      const bar = document.getElementById('console-bar');
      const chevron = document.getElementById('console-chevron');
      
      if (consoleExpanded) {
        bar.classList.add('expanded');
        chevron.setAttribute('icon', 'ph:caret-down-bold');
      } else {
        bar.classList.remove('expanded');
        chevron.setAttribute('icon', 'ph:caret-up-bold');
      }
    }

    // Parallax Effect
    const hero = document.getElementById('hero-section');
    const miss = document.getElementById('miss-container');
    
    if(hero && window.innerWidth > 1024) {
      hero.addEventListener('mousemove', (e) => {
        const { width, height } = hero.getBoundingClientRect();
        const x = (e.clientX / width - 0.5) * 20; // -10 to 10
        const y = (e.clientY / height - 0.5) * 20;
        
        // Move bg opposite to mouse
        hero.style.backgroundPosition = 'calc(50% - ' + x + 'px) calc(50% - ' + y + 'px)';
        
        // Move character slightly with mouse (depth)
        miss.style.transform = 'translate(' + (x*0.5) + 'px, ' + (y*0.5) + 'px)';
      });
    }

    // Config (Mainnet only)
    const RPC_URL = '${RPC_PROVIDERS[0]?.url || 'https://api.mainnet-beta.solana.com'}';
    const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    const PAYMENT_WALLET = '${PAYMENT_WALLET}';
    // SPL Token Program - handles all token transfers (USDC, etc.)
    const TOKEN_PROGRAM_ID = new solanaWeb3.PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
    // Associated Token Account Program - derives token account addresses
    const ASSOCIATED_TOKEN_PROGRAM_ID = new solanaWeb3.PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

    async function toggleWallet() {
      if (wallet) {
        // Full disconnect - clear Phantom's cached connection
        try {
          if (window.solana?.disconnect) {
            await window.solana.disconnect();
          }
        } catch(e) {
          console.warn('Disconnect error:', e);
        }
        wallet = null;
        document.getElementById('connect-btn').innerHTML = '<iconify-icon icon="ph:wallet-fill"></iconify-icon> CONNECT WALLET';
        document.getElementById('connect-btn').classList.remove('connected');
        document.getElementById('gen-btn').disabled = true;
        log('Wallet disconnected');
      } else {
        // Check for any Solana wallet (Phantom, Solflare, etc.)
        if (!window.solana) {
          return log('No Solana wallet found. Install Phantom or Solflare.', 'error');
        }
        try {
          // Disconnect first to force fresh wallet selection
          try { await window.solana.disconnect(); } catch(e) {}
          
          const r = await window.solana.connect();
          wallet = r.publicKey.toString();
          document.getElementById('connect-btn').innerText = wallet.slice(0,4)+'..'+wallet.slice(-4);
          document.getElementById('connect-btn').classList.add('connected');
          document.getElementById('gen-btn').disabled = false;
          log('Connected: '+wallet, 'success');
        } catch(e) { 
          log(e.message || 'Connection rejected', 'error'); 
        }
      }
    }

    async function getATA(mint, owner) {
      const [address] = await solanaWeb3.PublicKey.findProgramAddress(
        [new solanaWeb3.PublicKey(owner).toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), new solanaWeb3.PublicKey(mint).toBuffer()],
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
      return address;
    }

    async function generate() {
      if(!wallet) return;
      const type = document.getElementById('op-type').value;
      log('Initializing ' + type.toUpperCase() + '...');
      
      let receiptData = {
        request_id: 'req-' + Date.now(),
        timestamp: new Date().toISOString(),
        type: type.toUpperCase(),
        wallet: wallet,
      };
      
      try {
        // 1. Payment
        log('Preparing payment...');
        const conn = new solanaWeb3.Connection(RPC_URL, 'confirmed');
        const tx = new solanaWeb3.Transaction();
        const user = new solanaWeb3.PublicKey(wallet);
        const dest = new solanaWeb3.PublicKey(PAYMENT_WALLET);

        if(pay === 'usdc') {
          const uATA = await getATA(USDC_MINT, wallet);
          const dATA = await getATA(USDC_MINT, PAYMENT_WALLET);
          
          // Check if destination ATA exists, create if not
          const dATAInfo = await conn.getAccountInfo(dATA);
          if (!dATAInfo) {
            log('Creating destination token account...');
            // Create ATA instruction
            tx.add(new solanaWeb3.TransactionInstruction({
              keys: [
                { pubkey: user, isSigner: true, isWritable: true },
                { pubkey: dATA, isSigner: false, isWritable: true },
                { pubkey: new solanaWeb3.PublicKey(PAYMENT_WALLET), isSigner: false, isWritable: false },
                { pubkey: new solanaWeb3.PublicKey(USDC_MINT), isSigner: false, isWritable: false },
                { pubkey: solanaWeb3.SystemProgram.programId, isSigner: false, isWritable: false },
                { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
              ],
              programId: ASSOCIATED_TOKEN_PROGRAM_ID,
              data: new Uint8Array(0)
            }));
          }
          
          // Also check if user has USDC ATA
          const uATAInfo = await conn.getAccountInfo(uATA);
          if (!uATAInfo) {
            throw new Error('You do not have a USDC token account. Please get some USDC first.');
          }
          
          const data = new Uint8Array(9);
          const view = new DataView(data.buffer);
          view.setUint8(0, 3);
          view.setBigUint64(1, BigInt(10000), true);
          tx.add(new solanaWeb3.TransactionInstruction({
            keys: [{pubkey:uATA, isSigner:false, isWritable:true}, {pubkey:dATA, isSigner:false, isWritable:true}, {pubkey:user, isSigner:true, isWritable:false}],
            programId: TOKEN_PROGRAM_ID, data
          }));
          receiptData.payment = { method: 'USDC', amount: '$0.01' };
        } else {
          tx.add(solanaWeb3.SystemProgram.transfer({fromPubkey:user, toPubkey:dest, lamports:100000}));
          receiptData.payment = { method: 'SOL', amount: '0.0001 SOL' };
        }

        tx.feePayer = user;
        tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
        log('Awaiting wallet signature...');
        const {signature} = await window.solana.signAndSendTransaction(tx);
        receiptData.payment.tx_signature = signature;
        log('Payment confirmed', 'success');

        // 2. Prepare Request
        const proof = {tx_signature:signature, amount:1, payer:wallet, timestamp:Date.now()};
        let body = { request_hash: receiptData.request_id };
        let endpoint = '/v1/randomness';

        if (type === 'number') {
          endpoint = '/v1/random/number';
          body.min = parseInt(document.getElementById('in-min').value) || 1;
          body.max = parseInt(document.getElementById('in-max').value) || 100;
          receiptData.params = { min: body.min, max: body.max };
        } else if (type === 'dice') {
          endpoint = '/v1/random/dice';
          body.dice = document.getElementById('in-dice').value || '2d6';
          receiptData.params = { dice: body.dice };
        } else if (type === 'pick') {
          endpoint = '/v1/random/pick';
          body.items = (document.getElementById('in-items').value || 'A,B,C').split(',').map(s=>s.trim());
          receiptData.params = { items: body.items };
        }

        // 3. Call API
        log('Requesting TEE randomness...');
        const res = await fetch(endpoint, {
          method:'POST',
          headers:{'Content-Type':'application/json', 'X-Payment':'x402 '+btoa(JSON.stringify(proof))},
          body:JSON.stringify(body)
        });
        const data = await res.json();
        if(data.error) throw new Error(data.error);
        
        // 4. Store result
        receiptData.result = {
          random_seed: data.random_seed,
          tee_type: data.tee_type,
          attestation: data.attestation
        };

        if (data.number !== undefined) receiptData.result.value = data.number;
        if (data.total !== undefined) receiptData.result.value = data.total + ' (' + data.rolls.join(', ') + ')';
        if (data.picked !== undefined) receiptData.result.value = data.picked;
        
        // 5. Auto-verify attestation
        log('Verifying attestation...');
        try {
          const attRes = await fetch('/v1/attestation');
          const attData = await attRes.json();
          receiptData.attestation = {
            app_id: attData.app_id,
            compose_hash: attData.compose_hash || 'Simulation Mode',
            tee_type: attData.tee_type
          };
          
          if (attData.quote_hex) {
            const verifyRes = await fetch('/v1/verify', {
              method:'POST',
              headers:{'Content-Type':'application/json'},
              body:JSON.stringify({quote_hex: attData.quote_hex})
            });
            const verifyData = await verifyRes.json();
            receiptData.verification = {
              valid: verifyData.valid,
              verified_by: 'Phala Cloud Attestation API',
              verified_at: new Date().toISOString()
            };
          } else {
            receiptData.verification = { valid: false, note: 'Simulation mode - no hardware attestation' };
          }
        } catch(e) {
          receiptData.verification = { valid: false, error: e.message };
        }
        
        log('Complete!', 'success');
        showReceipt(receiptData);
        
      } catch(e) { 
        log(e.message, 'error'); 
      }
    }

    // Receipt Modal Functions
    function showReceipt(data) {
      const overlay = document.getElementById('receipt-overlay');
      const content = document.getElementById('receipt-content');
      
      // Format result display - show full seed for raw randomness, otherwise show value
      let resultDisplay = data.result.random_seed || 'N/A';
      if (data.result.value !== undefined) {
        resultDisplay = String(data.result.value);
      }
      
      // Build HTML
      content.innerHTML = \`
        <div class="receipt-header">
          <h3><iconify-icon icon="ph:check-circle-fill"></iconify-icon> TEE Randomness Receipt</h3>
          <button class="receipt-close" onclick="closeReceipt()">&times;</button>
        </div>
        
        <div class="receipt-section">
          <div class="receipt-section-title">Request</div>
          <div class="receipt-row">
            <span class="receipt-label">ID</span>
            <span class="receipt-value">\${data.request_id}</span>
          </div>
          <div class="receipt-row">
            <span class="receipt-label">Time</span>
            <span class="receipt-value">\${new Date(data.timestamp).toLocaleString()}</span>
          </div>
          <div class="receipt-row">
            <span class="receipt-label">Type</span>
            <span class="receipt-value highlight">\${data.type}</span>
          </div>
        </div>
        
        <div class="receipt-section" style="text-align: center; padding: 1.5rem 2rem;">
          <div class="receipt-section-title">Result</div>
          <div class="receipt-result">\${resultDisplay}</div>
        </div>
        
        <div class="receipt-section">
          <div class="receipt-section-title">Payment</div>
          <div class="receipt-row">
            <span class="receipt-label">Method</span>
            <span class="receipt-value">\${data.payment.method}</span>
          </div>
          <div class="receipt-row">
            <span class="receipt-label">Amount</span>
            <span class="receipt-value">\${data.payment.amount}</span>
          </div>
          <div class="receipt-row">
            <span class="receipt-label">TX</span>
            <a class="receipt-link" href="https://solscan.io/tx/\${data.payment.tx_signature}" target="_blank">
              \${data.payment.tx_signature.slice(0,8)}...\${data.payment.tx_signature.slice(-6)}
              <iconify-icon icon="ph:arrow-square-out"></iconify-icon>
            </a>
          </div>
        </div>
        
        <div class="receipt-section">
          <div class="receipt-section-title">Attestation</div>
          <div class="receipt-row">
            <span class="receipt-label">TEE Type</span>
            <span class="receipt-value">\${data.attestation?.tee_type || 'simulation'}</span>
          </div>
          <div class="receipt-row">
            <span class="receipt-label">App ID</span>
            <span class="receipt-value">\${(data.attestation?.app_id || 'N/A').slice(0, 16)}...</span>
          </div>
          <div class="receipt-row">
            <span class="receipt-label">Compose Hash</span>
            <span class="receipt-value">\${(data.attestation?.compose_hash || 'N/A').slice(0, 12)}...</span>
          </div>
          <div class="receipt-row" style="margin-top: 0.75rem;">
            <span class="receipt-label">Status</span>
            \${data.verification?.valid 
              ? '<span class="verification-badge"><iconify-icon icon="ph:seal-check-fill"></iconify-icon> Hardware Verified</span>'
              : '<span class="receipt-value" style="color: var(--text-muted);">Simulation Mode</span>'
            }
          </div>
        </div>
        
        <div class="receipt-actions">
          <button class="receipt-btn receipt-btn-secondary" onclick="copyReceipt()">
            <iconify-icon icon="ph:copy"></iconify-icon> Copy
          </button>
          <button class="receipt-btn receipt-btn-secondary" onclick="downloadReceipt()">
            <iconify-icon icon="ph:download-simple"></iconify-icon> Download
          </button>
          <button class="receipt-btn receipt-btn-primary" onclick="closeReceipt()">
            Done
          </button>
        </div>
      \`;
      
      // Store for copy/download
      window.currentReceipt = data;
      overlay.classList.add('visible');
    }
    
    function closeReceipt() {
      document.getElementById('receipt-overlay').classList.remove('visible');
    }
    
    function copyReceipt() {
      if (!window.currentReceipt) return;
      const text = JSON.stringify(window.currentReceipt, null, 2);
      navigator.clipboard.writeText(text).then(() => {
        showToast('Receipt copied to clipboard!');
      });
    }
    
    function downloadReceipt() {
      if (!window.currentReceipt) return;
      const data = JSON.stringify(window.currentReceipt, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'tee-receipt-' + window.currentReceipt.request_id + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Receipt downloaded!');
    }
    
    function showToast(message) {
      const toast = document.getElementById('toast');
      toast.innerText = message;
      toast.classList.add('visible');
      setTimeout(() => toast.classList.remove('visible'), 2500);
    }

    async function verify() {
      const btn = document.getElementById('verify-btn');
      btn.innerText = 'Verifying...';
      try {
        const att = await fetch('/v1/attestation').then(r=>r.json());
        const res = await fetch('/v1/verify', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({quote_hex:att.quote_hex})
        }).then(r=>r.json());
        
        const box = document.getElementById('verify-res');
        box.style.display = 'block';
        if(res.valid) box.innerHTML = '<div class="log-success">>> HARDWARE SIGNATURE VALIDATED<br>Intel TDX Enclave Confirmed</div>';
        else throw new Error('Invalid');
      } catch(e) {
        document.getElementById('verify-res').innerHTML = '<div class="log-error">>> VERIFICATION FAILED</div>';
      }
      btn.innerText = 'Verify Attestation Signature';
    }

    // Fetch compose hash on load
    (async function loadComposeHash() {
      try {
        const res = await fetch('/v1/attestation');
        const data = await res.json();
        const hashEl = document.getElementById('compose-hash');
        if (data.compose_hash) {
          hashEl.innerText = data.compose_hash;
        } else if (data.error) {
          hashEl.innerText = 'TEE: ' + (data.tee_type || 'simulation');
        } else {
          hashEl.innerText = 'Simulation Mode (No TEE)';
        }
      } catch(e) {
        document.getElementById('compose-hash').innerText = 'Failed to load';
      }
    })();
  </script>

  <!-- Receipt Modal -->
  <div id="receipt-overlay" class="receipt-overlay">
    <div class="receipt-modal" id="receipt-content">
      <!-- Populated by showReceipt() -->
    </div>
  </div>
  
  <!-- Toast Notification -->
  <div id="toast" class="toast"></div>
</body>
</html>
  `;
  res.type('html').send(html);
});

/**
 * GET /v1/attestation - Public verification data
 * Returns attestation info for independent verification
 */
app.get('/v1/attestation', async (_req: Request, res: Response) => {
  try {
    const dstack = getDstackClient();

    if (!dstack) {
      res.json({
        tee_type: TEE_TYPE,
        verified: false,
        error: 'TEE hardware not available (simulation mode)',
        verification_url: null,
      });
      return;
    }

    // Get fresh attestation quote for verification
    const reportData = crypto.createHash('sha256').update('attestation-request').digest();
    const quote = await dstack.getQuote(reportData);

    if (!quote || !quote.quote) {
      res.status(500).json({ error: 'Failed to generate attestation' });
      return;
    }

    // Parse event log to extract compose-hash and instance-id
    let composeHash = TEE_INFO.compose_hash;
    let instanceId = TEE_INFO.instance_id;

    if (quote.event_log) {
      try {
        const events = JSON.parse(quote.event_log);
        for (const event of events) {
          if (event.event === 'compose-hash') {
            composeHash = event.event_payload;
            TEE_INFO.compose_hash = composeHash;
          }
          if (event.event === 'instance-id') {
            instanceId = event.event_payload;
            TEE_INFO.instance_id = instanceId;
          }
          if (event.event === 'app-id') {
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
        phala_cloud_api: 'https://cloud-api.phala.network/api/v1/attestations/verify',
        phala_dashboard: `https://cloud.phala.network/dashboard/cvms/${TEE_INFO.app_id}`,
        instructions: 'POST the quote_hex to the verification API to verify this attestation',
      },
      source_code: {
        repository: 'https://github.com/mysterygift/mystery-gift',
        path: 'tee-worker/',
      },
    });
  } catch (error) {
    console.error('[TEE] Attestation info error:', error);
    res.status(500).json({ error: 'Failed to get attestation info' });
  }
});

/**
 * POST /v1/verify - Verify an attestation quote
 * Uses Phala Cloud's centralized verification API
 */
app.post('/v1/verify', async (req: Request, res: Response) => {
  try {
    const { attestation, quote_hex } = req.body;

    let quoteToVerify: string | undefined;

    // Accept either base64-encoded attestation or raw hex quote
    if (attestation) {
      try {
        const decoded = JSON.parse(Buffer.from(attestation, 'base64').toString());
        if (decoded.type === 'mock-tee-attestation') {
          res.json({
            valid: false,
            error: 'Mock attestation cannot be verified',
            tee_type: 'simulation',
          });
          return;
        }
        quoteToVerify = decoded.quote;
      } catch {
        res.status(400).json({ error: 'Invalid attestation format' });
        return;
      }
    } else if (quote_hex) {
      quoteToVerify = quote_hex;
    }

    if (!quoteToVerify) {
      res.status(400).json({ error: 'Missing attestation or quote_hex parameter' });
      return;
    }

    // Call Phala Cloud's verification API
    const verifyResponse = await fetch(
      'https://cloud-api.phala.network/api/v1/attestations/verify',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hex: quoteToVerify }),
        // Break request if it takes too long (5s timeout)
        // @ts-ignore - AbortSignal.timeout is available in Node 18+ but might not be in types
        signal: (AbortSignal as any).timeout(5000),
      }
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
      verified_by: 'Phala Cloud Attestation API',
      verified_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[TEE] Verification error:', error);
    res.status(500).json({ error: 'Verification failed' });
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
app.get('/changelog', (_req: Request, res: Response) => {
  const changelogPath = path.join(__dirname, '../CHANGELOG.md');
  let md = '';
  try { md = fs.readFileSync(changelogPath, 'utf-8'); } catch(e) { md = 'Changelog not found.'; }

  let sections: string[] = [];
  let currentSection = '';
  let preamble = '';
  let inVersion = false;
  let inList = false;
  const lines = md.split('\n');

  for (const line of lines) {
    let l = line.trim();
    
    // Header Detection
    if (l.startsWith('## ')) {
       // New Version Block
       if (inVersion) {
          if (inList) { currentSection += '</ul>\n'; inList = false; }
          sections.push(currentSection);
       } else {
          // End of preamble
          if (inList) { preamble += '</ul>\n'; inList = false; }
       }
       inVersion = true;
       currentSection = `<h2>${l.slice(3)}</h2>`;
    }
    // Main Title (Skip or add to preamble)
    else if (l.startsWith('# ')) {
       // Title usually "Changelog", we ignore it or add to preamble
       continue;
    }
    // Content Parsing
    else {
       let htmlLine = '';
       if (!l) {
          if (inList) { htmlLine = '</ul>\n'; inList = false; }
       }
       else if (l.startsWith('### ')) {
          if (inList) { htmlLine += '</ul>\n'; inList = false; }
          htmlLine += `<h3>${l.slice(4)}</h3>`;
       }
       else if (l.startsWith('- ')) {
          if (!inList) { htmlLine += '<ul>\n'; inList = true; }
          let text = l.slice(2);
          text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
          text = text.replace(/`([^`]*)`/g, '<code>$1</code>');
          text = text.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank">$1</a>');
          htmlLine += `<li>${text}</li>`;
       }
       else {
          if (inList) { htmlLine += '</ul>\n'; inList = false; }
          htmlLine += `<p>${l}</p>`;
       }
       
       if (inVersion) currentSection += htmlLine;
       else preamble += htmlLine;
    }
  }
  
  // Push last section
  if (inList) { 
     if (inVersion) currentSection += '</ul>\n';
     else preamble += '</ul>\n';
  }
  if (inVersion) sections.push(currentSection);

  // Reverse Order (Oldest First)
  sections.reverse();

  let content = preamble + sections.join('\n');

  res.type('html').send(renderStaticPage('Changelog', content));
});

/**
 * GET /terms - Terms of Service
 */
app.get('/terms', (_req: Request, res: Response) => {
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

  res.type('html').send(renderStaticPage('Terms of Service', content));
});

/**
 * GET /privacy - Privacy Policy
 */
app.get('/privacy', (_req: Request, res: Response) => {
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

  res.type('html').send(renderStaticPage('Privacy Policy', content));
});

/**
 * Helper to interact with TEE hardware for attestation via dStack SDK
 */
async function generateAttestation(seed: string, requestHash: string): Promise<string> {
  // Combine seed and request hash to prevent replay attacks
  const reportData = crypto
    .createHash('sha256')
    .update(seed)
    .update(requestHash || '')
    .digest();

  try {
    // Use dStack SDK to get quote
    const dstack = getDstackClient();
    if (!dstack) throw new Error('dStack client not initialized');

    // Pass the raw Buffer (32 bytes) directly to the SDK
    // The SDK handles sending this as the report_data for the quote
    const quote = await dstack.getQuote(reportData);

    if (quote && quote.quote) {
      // Wrap the real quote in a JSON object to match the server's expected format
      // and provide additional verification data (event log, etc.)
      return Buffer.from(
        JSON.stringify({
          type: 'tdx-attestation',
          quote: quote.quote,
          event_log: quote.event_log,
          algorithm: 'sha256',
          provider: 'phala-dstack',
        })
      ).toString('base64');
    } else {
      throw new Error('Invalid quote response from SDK');
    }
  } catch (error) {
    console.warn('[TEE] Attestation failed, falling back to simulation:', error);

    // Fallback for simulation/dev mode
    return Buffer.from(
      JSON.stringify({
        type: 'mock-tee-attestation',
        report_data: reportData.toString('hex'),
        timestamp: Date.now(),
        warning: 'No TEE hardware detected - simulation mode',
      })
    ).toString('base64');
  }
}

// Start server
async function start() {
  // Try to detect TEE type via SDK info
  const dstack = getDstackClient();
  if (dstack) {
    try {
      // SDK doesn't have explicit "detect" but getting info should work
      const info = await dstack.info().catch(() => null);
      if (info) {
        TEE_TYPE = 'tdx';
        console.log('[TEE] dStack detected, running in TDX mode');
      } else {
        console.log('[TEE] dStack not detected, running in simulation mode');
      }
    } catch (e) {
      console.log('[TEE] Error checking dStack status:', e);
    }
  }

  // Serve static files
  app.use('/assets', express.static(path.join(__dirname, '../static')));

  const server = app.listen(PORT, () => {
    console.log(`[TEE] Randomness Worker v2.8 running on port ${PORT}`);
    console.log(`[TEE] Environment: ${TEE_TYPE.toUpperCase()}`);
  });

  // Graceful shutdown
  const shutdown = () => {
    console.log('[TEE] Shutting down...');
    server.close(() => {
      console.log('[TEE] Server closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start();

export { app };
