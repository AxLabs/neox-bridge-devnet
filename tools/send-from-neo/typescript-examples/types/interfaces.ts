import type { Account } from "../neo/neon-adapter";

/**
 * @fileoverview Interface definitions for Message Bridge operations
 */

export interface TransactionResult {
    txHash: string;
    blockIndex?: number;
    gasConsumed?: string;
}

export interface BasicParams {
    sendingFee: number;
}

export interface SendResultMessageParams extends BasicParams {
    nonce: number;
}

export interface MessageParams extends BasicParams {
    messageData: string | number[];
}

export type SendStoreOnlyMessageParams = MessageParams;

export interface SendExecutableMessageParams extends MessageParams{
    storeResult: boolean;
}

export interface MessageBridgeConfig {
    contractHash: string;
    rpcUrl: string;
    account: Account;
}

export type { Account };
