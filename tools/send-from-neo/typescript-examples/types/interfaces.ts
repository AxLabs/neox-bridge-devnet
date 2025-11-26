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

export interface ContractWrapperConfig {
    contractHash: string;
    rpcUrl: string;
    account: Account;
}

// TypeScript types matching the Java MessageBridge structure
export interface State {
    nonce: number;
    root: string; // hex string representation of ByteString
}

export interface MessageBridgeConfigData {
    sendingFee: number;
    maxMessageSize: number;
    maxNrMessages: number;
    executionManager: string; // hex string representation of Hash160
    executionWindowMilliseconds: number;
}

export interface MessageBridgeData {
    evmToNeoState: State;
    neoToEvmState: State;
    config: MessageBridgeConfigData;
}

// TypeScript types matching the Java NeoMessage structure
export interface NeoMessage {
    metadataBytes: string; // hex string representation of ByteString
    rawMessage: string; // hex string representation of ByteString
}

// Base metadata interface
export interface NeoMetadata {
    type: number; // 0: EXECUTABLE, 1: STORE_ONLY, 2: RESULT
    timestamp: number;
    sender: string; // hex string representation of Hash160
}

// Executable metadata type
export interface NeoMetadataExecutable extends NeoMetadata {
    type: 0; // MESSAGE_TYPE_EXECUTABLE
    storeResult: boolean;
}

// Store-only metadata type
export interface NeoMetadataStoreOnly extends NeoMetadata {
    type: 1; // MESSAGE_TYPE_STORE_ONLY
}

// Result metadata type
export interface NeoMetadataResult extends NeoMetadata {
    type: 2; // MESSAGE_TYPE_RESULT
    initialMessageNonce: number;
}

// Union type for all metadata types
export type NeoMetadataUnion = NeoMetadataExecutable | NeoMetadataStoreOnly | NeoMetadataResult;

// TypeScript type matching the Java ExecutableState structure
export interface ExecutableState {
    executed: boolean;
    expirationTime: number;
}

export type { Account };
