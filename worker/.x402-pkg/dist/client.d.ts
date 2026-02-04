import type { PaymentRequirements, PaymentRequirementsConfig, PaymentPayload, VerifyResponse, SettleResponse, SupportedNetwork, X402ServerConfig } from './types';
/**
 * x402 Server-Side Integration
 *
 * Calls the facilitator's /verify and /settle endpoints
 * to validate and execute payments per the x402 protocol.
 */
export declare class X402Server {
    private facilitatorUrl;
    private logger;
    constructor(config: X402ServerConfig);
    /**
     * Verify a payment payload against requirements via the facilitator.
     * Called BEFORE executing the protected handler.
     */
    verify(paymentPayload: PaymentPayload, paymentRequirements: PaymentRequirements): Promise<VerifyResponse>;
    /**
     * Settle a verified payment via the facilitator.
     * Called AFTER the protected handler has executed successfully.
     */
    settle(paymentPayload: PaymentPayload, paymentRequirements: PaymentRequirements): Promise<SettleResponse>;
    /**
     * Get supported networks and assets from the facilitator.
     */
    getSupported(): Promise<SupportedNetwork[]>;
    /**
     * Decode a base64-encoded X-PAYMENT header value into a PaymentPayload.
     */
    static decodePaymentHeader(headerValue: string): PaymentPayload | null;
    /**
     * Build a PaymentRequirements object from a simpler config.
     */
    static buildPaymentRequirements(config: PaymentRequirementsConfig): PaymentRequirements;
}
//# sourceMappingURL=client.d.ts.map