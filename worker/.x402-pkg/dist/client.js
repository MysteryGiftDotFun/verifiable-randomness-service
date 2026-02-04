"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.X402Server = void 0;
const defaultLogger = {
    info: (...args) => console.log('[x402]', ...args),
    error: (...args) => console.error('[x402]', ...args),
    warn: (...args) => console.warn('[x402]', ...args),
};
/**
 * Safely serialize objects for JSON transport.
 * Handles BigInt and other non-JSON-safe types.
 */
function toJsonSafe(obj) {
    return JSON.parse(JSON.stringify(obj, (_key, value) => typeof value === 'bigint' ? value.toString() : value));
}
/**
 * x402 Server-Side Integration
 *
 * Calls the facilitator's /verify and /settle endpoints
 * to validate and execute payments per the x402 protocol.
 */
class X402Server {
    constructor(config) {
        this.facilitatorUrl = config.facilitatorUrl.replace(/\/$/, '');
        this.logger = config.logger || defaultLogger;
    }
    /**
     * Verify a payment payload against requirements via the facilitator.
     * Called BEFORE executing the protected handler.
     */
    async verify(paymentPayload, paymentRequirements) {
        const url = `${this.facilitatorUrl}/verify`;
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    x402Version: paymentPayload.x402Version,
                    paymentPayload: toJsonSafe(paymentPayload),
                    paymentRequirements: toJsonSafe(paymentRequirements),
                }),
            });
            if (!response.ok) {
                const errorText = await response.text();
                this.logger.error('Facilitator verify failed', { status: response.status, error: errorText });
                return { isValid: false, invalidReason: `Facilitator error: ${response.status}` };
            }
            const data = (await response.json());
            this.logger.info('Payment verified', { isValid: data.isValid, payer: data.payer });
            return data;
        }
        catch (error) {
            this.logger.error('Verify request failed', { error });
            return { isValid: false, invalidReason: 'Facilitator unreachable' };
        }
    }
    /**
     * Settle a verified payment via the facilitator.
     * Called AFTER the protected handler has executed successfully.
     */
    async settle(paymentPayload, paymentRequirements) {
        const url = `${this.facilitatorUrl}/settle`;
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    x402Version: paymentPayload.x402Version,
                    paymentPayload: toJsonSafe(paymentPayload),
                    paymentRequirements: toJsonSafe(paymentRequirements),
                }),
            });
            if (!response.ok) {
                const errorText = await response.text();
                this.logger.error('Facilitator settle failed', { status: response.status, error: errorText });
                return { success: false, errorReason: `Facilitator error: ${response.status}` };
            }
            const data = (await response.json());
            this.logger.info('Payment settled', { success: data.success, transaction: data.transaction });
            return data;
        }
        catch (error) {
            this.logger.error('Settle request failed', { error });
            return { success: false, errorReason: 'Facilitator unreachable' };
        }
    }
    /**
     * Get supported networks and assets from the facilitator.
     */
    async getSupported() {
        const url = `${this.facilitatorUrl}/supported`;
        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
            });
            if (!response.ok) {
                this.logger.warn('Failed to fetch supported networks', { status: response.status });
                return [];
            }
            return (await response.json());
        }
        catch (error) {
            this.logger.warn('Supported networks request failed', { error });
            return [];
        }
    }
    /**
     * Decode a base64-encoded X-PAYMENT header value into a PaymentPayload.
     */
    static decodePaymentHeader(headerValue) {
        try {
            const decoded = JSON.parse(Buffer.from(headerValue, 'base64').toString('utf-8'));
            if (!decoded.x402Version || !decoded.scheme || !decoded.network || !decoded.payload) {
                return null;
            }
            return decoded;
        }
        catch {
            return null;
        }
    }
    /**
     * Build a PaymentRequirements object from a simpler config.
     */
    static buildPaymentRequirements(config) {
        return {
            scheme: config.scheme || 'exact',
            network: config.network,
            maxAmountRequired: config.maxAmountRequired,
            asset: config.asset,
            payTo: config.payTo,
            resource: config.resource,
            description: config.description,
            maxTimeoutSeconds: config.maxTimeoutSeconds || 60,
            ...(config.extra && { extra: config.extra }),
        };
    }
}
exports.X402Server = X402Server;
//# sourceMappingURL=client.js.map