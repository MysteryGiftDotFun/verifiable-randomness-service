import crypto from "crypto";
import { Readable } from "stream";
import { Keypair } from "@solana/web3.js";
import { TurboFactory } from "@ardrive/turbo-sdk";
import bs58 from "bs58";

export interface RandomnessResult {
  type:
    | "randomness"
    | "number"
    | "dice"
    | "pick"
    | "shuffle"
    | "winners"
    | "uuid";
  value: any;
  params?: any;
}

export interface ArweaveCommitmentResult {
  arweave_tx_id: string;
  arweave_url: string;
  encrypted: boolean;
}

export function computeCommitmentHash(
  seed: string,
  requestHash: string,
): string {
  return crypto
    .createHash("sha256")
    .update(seed)
    .update(requestHash || "")
    .digest("hex");
}

export async function commitToArweave(
  seed: string,
  attestation: string,
  requestHash: string,
  endpoint: string,
  appId: string,
  keypair: Keypair,
  result: RandomnessResult,
  metadata?: Record<string, any>,
  passphrase?: string,
): Promise<ArweaveCommitmentResult> {
  const commitmentHash = computeCommitmentHash(seed, requestHash);

  let quoteHex: string | undefined;
  let eventLog: string | undefined;
  try {
    const decoded = JSON.parse(Buffer.from(attestation, "base64").toString());
    if (decoded.quote) {
      quoteHex = decoded.quote;
    }
    if (decoded.event_log) {
      eventLog = decoded.event_log;
    }
  } catch {}

  const payload = {
    randomness_result: result,
    attestation,
    quote_hex: quoteHex,
    event_log: eventLog,
    request_hash: requestHash,
    commitment_hash: commitmentHash,
    endpoint,
    timestamp: Date.now(),
    tee_type: "tdx",
    app_id: appId,
    metadata: metadata || {},
    verification: {
      phala_verifier: "https://proof.t16z.com/",
      instructions:
        "Paste the quote_hex into the Phala verifier to verify the attestation",
    },
  };

  const turbo = TurboFactory.authenticated({
    privateKey: bs58.encode(keypair.secretKey),
    token: "solana",
  });

  let payloadBuffer: Buffer;
  let tags: { name: string; value: string }[];

  if (passphrase) {
    const iv = crypto.randomBytes(12);
    const key = crypto.pbkdf2Sync(
      passphrase,
      "mystery-gift-rng",
      100000,
      32,
      "sha256",
    );
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(payload)),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    payloadBuffer = Buffer.concat([iv, authTag, encrypted]);

    tags = [
      { name: "Content-Type", value: "application/octet-stream" },
      { name: "Encrypted", value: "true" },
      { name: "Cipher", value: "AES-256-GCM" },
      { name: "App-Name", value: "mystery-gift-rng" },
      { name: "Commitment-Hash", value: commitmentHash },
      { name: "TEE-Type", value: "tdx" },
      { name: "Endpoint", value: endpoint },
    ];
    console.log(`[TEE] Arweave proof encrypted with passphrase`);
  } else {
    payloadBuffer = Buffer.from(JSON.stringify(payload));
    tags = [
      { name: "Content-Type", value: "application/json" },
      { name: "App-Name", value: "mystery-gift-rng" },
      { name: "Commitment-Hash", value: commitmentHash },
      { name: "TEE-Type", value: "tdx" },
      { name: "Endpoint", value: endpoint },
    ];
  }

  const uploadResult = await turbo.uploadFile({
    fileStreamFactory: () => Readable.from(payloadBuffer),
    fileSizeFactory: () => payloadBuffer.length,
    dataItemOpts: {
      tags,
    },
  });

  const txId = uploadResult.id;
  console.log(`[TEE] Arweave proof uploaded: ${txId}`);

  return {
    arweave_tx_id: txId,
    arweave_url: `https://arweave.net/${txId}`,
    encrypted: !!passphrase,
  };
}
