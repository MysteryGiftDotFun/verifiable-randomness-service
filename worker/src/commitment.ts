import crypto from 'crypto';
import { Readable } from 'stream';
import { Keypair } from '@solana/web3.js';
import { TurboFactory } from '@ardrive/turbo-sdk';
import bs58 from 'bs58';

export interface ArweaveCommitmentResult {
  arweave_tx_id: string;
  arweave_url: string;
}

/**
 * Compute SHA256(seed + requestHash) as a hex string
 */
export function computeCommitmentHash(seed: string, requestHash: string): string {
  return crypto
    .createHash('sha256')
    .update(seed)
    .update(requestHash || '')
    .digest('hex');
}

/**
 * Upload the full proof payload to Arweave via Turbo SDK with on-demand SOL funding.
 */
export async function commitToArweave(
  seed: string,
  attestation: string,
  requestHash: string,
  endpoint: string,
  appId: string,
  keypair: Keypair,
  metadata?: Record<string, any>
): Promise<ArweaveCommitmentResult> {
  const commitmentHash = computeCommitmentHash(seed, requestHash);

  // PRIVACY: Do NOT include the raw seed in Arweave proofs.
  // Users verify by computing SHA256(seed + request_hash) and comparing to commitment_hash.
  // This allows proof verification without exposing the actual random output publicly.
  const payload = {
    // seed intentionally omitted - verify via commitment_hash = SHA256(seed + request_hash)
    attestation,
    request_hash: requestHash,
    commitment_hash: commitmentHash,
    endpoint,
    timestamp: Date.now(),
    tee_type: 'tdx',
    app_id: appId,
    metadata: metadata || {},
  };

  const turbo = TurboFactory.authenticated({
    privateKey: bs58.encode(keypair.secretKey),
    token: 'solana',
  });

  const payloadBuffer = Buffer.from(JSON.stringify(payload));

  const result = await turbo.uploadFile({
    fileStreamFactory: () => Readable.from(payloadBuffer),
    fileSizeFactory: () => payloadBuffer.length,
    dataItemOpts: {
      tags: [
        { name: 'Content-Type', value: 'application/json' },
        { name: 'App-Name', value: 'mystery-gift-rng' },
        { name: 'Commitment-Hash', value: commitmentHash },
        { name: 'TEE-Type', value: 'tdx' },
        { name: 'Endpoint', value: endpoint },
      ],
    },
  });

  const txId = result.id;
  console.log(`[TEE] Arweave proof uploaded: ${txId}`);

  return {
    arweave_tx_id: txId,
    arweave_url: `https://arweave.net/${txId}`,
  };
}
