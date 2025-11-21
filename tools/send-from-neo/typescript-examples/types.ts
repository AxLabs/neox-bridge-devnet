/**
 * @fileoverview Type definitions for Message Bridge operations
 */

// Custom error types for better debugging
export class MessageBridgeError extends Error {
    public code?: string;

    constructor(message: string, code?: string) {
        super(message);
        this.name = 'MessageBridgeError';
        this.code = code;
    }
}

export class ContractInvocationError extends MessageBridgeError {
    constructor(message: string, public readonly exception?: string | null) {
        super(message, 'CONTRACT_INVOCATION_FAILED');
        this.name = 'ContractInvocationError';
    }
}

export class InsufficientFundsError extends MessageBridgeError {
    constructor(message: string, public readonly required: string, public readonly available: string) {
        super(message, 'INSUFFICIENT_FUNDS');
        this.name = 'InsufficientFundsError';
    }
}

export class InvalidParameterError extends MessageBridgeError {
    constructor(public readonly parameterName: string, public readonly expectedType?: string) {
        let message = `${parameterName} must be provided ${expectedType ? `as ${expectedType}` : ''}.`;
        super(message, 'INVALID_PARAMETER');
        this.name = 'InvalidParameterError';
    }
}

export interface BalanceResponse {
    balance: Array<{
        assethash: string;
        amount: string;
        lastupdatedblock: number;
    }>;
}

// Transaction result with proper typing
export interface TransactionResult {
    txHash: string;
    blockIndex?: number;
    gasConsumed?: string;
}

// Message Bridge operation parameters with consistent naming
export interface SendExecutableMessageParams {
    messageData: string | number[];
    storeResult: boolean;
    sendingFee: number;
}

export interface SendResultMessageParams {
    nonce: number;
    sendingFee: number;
}

export interface SendStoreOnlyMessageParams {
    messageData: string | number[];
    sendingFee: number;
}

// Import Account type from neon-adapter
import type { Account } from "./neon-adapter.js";

// Configuration interface
export interface MessageBridgeConfig {
    contractHash: string;
    rpcUrl: string;
    account: Account;
    networkMagic?: number;
}

// Re-export Account type for convenience
export type { Account };
