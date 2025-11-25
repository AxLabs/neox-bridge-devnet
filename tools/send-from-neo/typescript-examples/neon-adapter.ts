/**
 * @fileoverview Neon-JS ESM Adapter
 *
 * This module provides a clean, type-safe ESM interface for the @cityofzion/neon-js library.
 * It addresses several key issues:
 *
 * 1. ESM/CJS Interop: Normalizes export access patterns across different environments
 * 2. Type Safety: Re-exports official types from neon-core and adds runtime validation
 * 3. Consistent API: Provides a stable interface that isolates consumers from neon-js internals
 *
 * CRITICAL DEPENDENCIES:
 * - @cityofzion/neon-js: Main functionality (runtime only)
 * - @cityofzion/neon-core: Types only (import type - safe to use)
 *
 * USAGE PATTERNS:
 * - Preferred: Use neonAdapter.create.*, neonAdapter.is.*, etc.
 * - Avoid: Direct access to neonAdapter.*Utils (deprecated)
 *
 * BREAKING CHANGE RISK:
 * - High: If neon-js changes export structure, the Neon resolution logic will need updates
 * - Medium: If neon-core changes type exports, type imports will need updates
 * - Low: If neon-js changes API, adapter methods will need updates
 *
 * @see https://github.com/CityOfZion/neon-js/issues/850
 * @version 1.0.0
 */

import NeonImport, { api, CONST, experimental, logging, rpc, sc, tx, u, wallet } from "@cityofzion/neon-js";
// Type-only imports from neon-core should be safe - they don't affect runtime
// See https://github.com/CityOfZion/neon-js/issues/850 for potential issues with importing neon-core directly
import type { QueryLike } from "@cityofzion/neon-core/lib/rpc/Query";
import type { NetworkJSON } from "@cityofzion/neon-core/lib/rpc/Network";
import type { ContractParamJson } from "@cityofzion/neon-core/lib/sc/ContractParam";
import type { AccountJSON, WalletJSON } from "@cityofzion/neon-core/lib/wallet";
import type { KeyType } from "@cityofzion/neon-core/lib/wallet/Account";
import type { ScryptParams } from "@cityofzion/neon-core/lib/wallet/nep2";

// Normalize the neon-js exports to proper ESM structure
// CRITICAL WORKAROUND: neon-js has complex ESM/CJS interop requirements
// - In some environments, the default export is nested under a 'default' property
// - This adapter normalizes access to ensure consistent behavior across environments
// - If @cityofzion/neon-js changes their export structure, this will need updating

/**
 * Resolves the correct Neon export structure across different module environments
 * @returns The resolved Neon object or null if unable to resolve
 */
function resolveNeonExports() {
    // Check for nested default export pattern (common in some ESM/CJS interop scenarios)
    if ('default' in NeonImport && typeof (NeonImport as any).default?.create === 'object') {
        return (NeonImport as { default: typeof NeonImport }).default;
    }

    // Check for direct export pattern
    if (typeof NeonImport?.create === 'object') {
        return NeonImport;
    }

    // Unable to resolve - return null instead of throwing
    return null;
}

const resolvedNeon = resolveNeonExports();

const Neon = resolvedNeon ? resolvedNeon : (() => {
    throw new Error(
        'Failed to initialize neon-js adapter: Unable to resolve neon-js export structure. ' +
        'This may indicate a breaking change in @cityofzion/neon-js export structure. ' +
        'Please check that @cityofzion/neon-js is properly installed and compatible.'
    );
})();

// Re-export proper types from neon-js and neon-core - these are the main types external modules should use
export type Wallet = InstanceType<typeof wallet.Wallet>;
export type Account = InstanceType<typeof wallet.Account>;
// Re-export the official types instead of duplicating them
export type { AccountJSON, WalletJSON, KeyType, ScryptParams };
export type ContractParam = InstanceType<typeof sc.ContractParam>;
export type ScriptBuilder = InstanceType<typeof sc.ScriptBuilder>;
export type RPCClient = InstanceType<typeof rpc.RPCClient>;
export type Query = InstanceType<typeof rpc.Query>;
export type Network = InstanceType<typeof rpc.Network>;
export type StringStream = InstanceType<typeof u.StringStream>;
export type Transaction = InstanceType<typeof tx.Transaction>;

// Define a union type for contract parameter values for convenience
type ContractParamValueType = string | number | boolean | ContractParamJson[] | null | undefined;

export interface NeonAdapter {
    create: {
        wallet: (walletJson: WalletJSON) => Wallet;
        account: (key: string) => Account;
        privateKey: () => string;
        signature: (tx: string, privateKey: string) => string;
        contractParam: (type: keyof typeof sc.ContractParamType, value?: ContractParamValueType) => ContractParam;
        script: typeof sc.createScript;
        scriptBuilder: () => ScriptBuilder;
        rpcClient: (net: string) => RPCClient;
        query: (req: QueryLike<unknown[]>) => Query;
        network: (net: Partial<NetworkJSON>) => Network;
        stringStream: (str?: string) => StringStream;
    };
    is: {
        address: (str: string) => boolean;
        publicKey: (str: string) => boolean;
        encryptedKey: (str: string) => boolean;
        privateKey: (str: string) => boolean;
        wif: (str: string) => boolean;
        scriptHash: (str: string) => boolean;
    };
    sign: {
        hex: (hex: string, privateKey: string) => string;
        message: (msg: string, privateKey: string) => string;
    };
    verify: {
        hex: (hex: string, signature: string, publicKey: string) => boolean;
        message: (msg: string, sig: string, publicKey: string) => boolean;
    };
    encrypt: {
        privateKey: (privateKey: string, passphrase: string) => Promise<string>;
    };
    decrypt: {
        privateKey: (encryptedKey: string, passphrase: string) => Promise<string>;
    };
    // Deserialization utilities
    deserialize: {
        attribute: typeof tx.TransactionAttribute.deserialize;
        script: typeof tx.Witness.deserialize;
        tx: typeof tx.Transaction.deserialize;
    };
    // API module for network operations
    apiWrapper: typeof api;
    // Experimental features
    experimentalWrapper: typeof experimental;
    // Logging utilities
    loggingWrapper: typeof logging;
    // Direct module access - USE WITH CAUTION
    // WARNING: These expose neon-js internals directly and may break if the library changes
    // Consider using the adapter methods above instead of these raw modules
    // These are provided for advanced use cases but should be avoided in most scenarios
    /** @deprecated Use adapter methods instead of accessing raw modules directly */
    walletUtils: typeof wallet;
    /** @deprecated Use adapter methods instead of accessing raw modules directly */
    smartContractUtils: typeof sc;
    /** @deprecated Use adapter methods instead of accessing raw modules directly */
    rpcUtils: typeof rpc;
    /** @deprecated Use adapter methods instead of accessing raw modules directly */
    utils: typeof u;
    /** @deprecated Use adapter methods instead of accessing raw modules directly */
    transactionUtils: typeof tx;
    /** @deprecated Use adapter methods instead of accessing raw modules directly */
    constants: typeof CONST;
}

// Create a clean ESM interface that normalizes the runtime/TypeScript mismatch
export const neonAdapter: NeonAdapter = {
    create: {
        wallet: (walletJson: WalletJSON): Wallet => {
            return Neon.create.wallet(walletJson);
        },
        account: (key: string): Account => {
            return Neon.create.account(key);
        },
        privateKey: (): string => {
            return Neon.create.privateKey();
        },
        signature: (tx: string, privateKey: string): string => {
            return Neon.create.signature(tx, privateKey);
        },
        contractParam: (type: keyof typeof sc.ContractParamType, value?: ContractParamValueType): ContractParam => {
            // Runtime validation to ensure type safety
            if (!(type in sc.ContractParamType)) {
                const validTypes = Object.keys(sc.ContractParamType).join(', ');
                throw new Error(`Invalid contract parameter type: ${String(type)}. Valid types are: ${validTypes}`);
            }
            return Neon.create.contractParam(type, value);
        },
        script: Neon.create.script,
        scriptBuilder: (): ScriptBuilder => {
            return Neon.create.scriptBuilder();
        },
        rpcClient: (net: string): RPCClient => {
            return Neon.create.rpcClient(net);
        },
        query: (req: QueryLike<unknown[]>): Query => {
            return Neon.create.query(req);
        },
        network: (net: Partial<NetworkJSON>): Network => {
            return Neon.create.network(net);
        },
        stringStream: (str?: string): StringStream => {
            return Neon.create.stringStream(str);
        }
    },
    is: {
        address: (str: string): boolean => Neon.is.address(str),
        publicKey: (str: string): boolean => Neon.is.publicKey(str),
        encryptedKey: (str: string): boolean => Neon.is.encryptedKey(str),
        privateKey: (str: string): boolean => Neon.is.privateKey(str),
        wif: (str: string): boolean => Neon.is.wif(str),
        scriptHash: (str: string): boolean => Neon.is.scriptHash(str)
    },
    sign: {
        hex: (hex: string, privateKey: string): string => Neon.sign.hex(hex, privateKey),
        message: (msg: string, privateKey: string): string => Neon.sign.message(msg, privateKey)
    },
    verify: {
        hex: (hex: string, signature: string, publicKey: string): boolean => Neon.verify.hex(hex, signature, publicKey),
        message: (msg: string, sig: string, publicKey: string): boolean => Neon.verify.message(msg, sig, publicKey)
    },
    encrypt: {
        privateKey: (privateKey: string, passphrase: string): Promise<string> => {
            try {
                return Neon.encrypt.privateKey(privateKey, passphrase);
            } catch (error) {
                return Promise.reject(new Error(`Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
            }
        }
    },
    decrypt: {
        privateKey: (encryptedKey: string, passphrase: string): Promise<string> => {
            try {
                return Neon.decrypt.privateKey(encryptedKey, passphrase);
            } catch (error) {
                return Promise.reject(new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
            }
        }
    },
    // Deserialization utilities
    deserialize: {
        attribute: tx.TransactionAttribute.deserialize,
        script: tx.Witness.deserialize,
        tx: tx.Transaction.deserialize
    },
    // API module for network operations
    apiWrapper: api,
    // Experimental features
    experimentalWrapper: experimental,
    // Logging utilities
    loggingWrapper: logging,
    // Re-export the core modules for direct access if needed
    walletUtils: wallet,
    smartContractUtils: sc,
    rpcUtils: rpc,
    utils: u,
    transactionUtils: tx,
    constants: CONST
};

// Named exports for specific functionality
export const {
    create,
    is,
    sign,
    verify,
    encrypt,
    decrypt,
    deserialize,
    apiWrapper,
    experimentalWrapper,
    loggingWrapper
} = neonAdapter;
