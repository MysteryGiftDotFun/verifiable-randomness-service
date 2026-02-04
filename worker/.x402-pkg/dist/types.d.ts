/**
 * x402 Protocol Types
 * Implements the Coinbase x402 standard used by PayAI facilitator.
 * Reference: https://www.x402.org
 */
/** Payment requirements returned in 402 response `accepts` array */
export interface PaymentRequirements {
    /** Payment scheme (e.g., "exact") */
    scheme: string;
    /** Blockchain network (e.g., "solana", "base") */
    network: string;
    /** Maximum amount required in smallest unit (e.g., "10000" for $0.01 USDC with 6 decimals) */
    maxAmountRequired: string;
    /** Token contract/mint address */
    asset: string;
    /** Recipient wallet address */
    payTo: string;
    /** The resource URL being paid for */
    resource: string;
    /** Human-readable description */
    description: string;
    /** Maximum timeout in seconds for the payment */
    maxTimeoutSeconds: number;
    /** Extra fields (e.g., feePayer for Solana) */
    extra?: Record<string, string>;
}
/** Decoded X-PAYMENT header payload */
export interface PaymentPayload {
    /** Protocol version (always 1) */
    x402Version: number;
    /** Payment scheme (e.g., "exact") */
    scheme: string;
    /** Blockchain network (e.g., "solana", "base") */
    network: string;
    /** Network-specific payload */
    payload: {
        /** Base64-encoded signed transaction (Solana) */
        transaction?: string;
        /** EIP-3009 authorization fields (EVM) */
        authorization?: Record<string, string>;
    };
}
/** Facilitator /verify response */
export interface VerifyResponse {
    /** Whether the payment is valid */
    isValid: boolean;
    /** Reason for invalidity, if any */
    invalidReason?: string;
    /** Payer wallet address */
    payer?: string;
}
/** Facilitator /settle response */
export interface SettleResponse {
    /** Whether settlement was successful */
    success: boolean;
    /** On-chain transaction hash */
    transaction?: string;
    /** Network the settlement occurred on */
    network?: string;
    /** Payer wallet address */
    payer?: string;
    /** Error reason if settlement failed */
    errorReason?: string;
}
/** Facilitator /supported response entry */
export interface SupportedNetwork {
    network: string;
    assets: string[];
    feePayer?: string;
}
/** Server-side x402 configuration */
export interface X402ServerConfig {
    /** Facilitator URL (e.g., "https://facilitator.payai.network") */
    facilitatorUrl: string;
    /** Logger instance */
    logger?: X402Logger;
}
/** Payment requirements builder config */
export interface PaymentRequirementsConfig {
    /** Payment scheme (default: "exact") */
    scheme?: string;
    /** Blockchain network */
    network: string;
    /** Amount in smallest unit */
    maxAmountRequired: string;
    /** Token contract/mint address */
    asset: string;
    /** Recipient wallet address */
    payTo: string;
    /** Resource URL */
    resource: string;
    /** Description */
    description: string;
    /** Timeout in seconds (default: 60) */
    maxTimeoutSeconds?: number;
    /** Extra fields */
    extra?: Record<string, string>;
}
export interface X402Logger {
    info(...args: any[]): void;
    error(...args: any[]): void;
    warn(...args: any[]): void;
}
//# sourceMappingURL=types.d.ts.map