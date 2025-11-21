import { type Account, neonAdapter, WitnessScope } from "./neon-adapter.js";
import { createDecryptedAccountFromWalletFile } from "./wallet.js";

/**
 * @fileoverview Message Bridge Contract Wrapper
 *
 * Ethers.js-style contract wrapper for the Neo3 Message Bridge contract.
 * Initialize with connection details and account, then call contract methods directly.
 */

export interface MessageBridgeConfig {
    contractHash: string;
    rpcUrl: string;
    account: Account;
    networkMagic?: number; // Optional network magic number (default: 5195086 for TestNet)
}

export interface SendExecutableMessageParams {
    messageData: string | number[]; // Hex string or byte array
    storeResult: boolean;
    sendingFee: number; // Optional, will query contract if not provided
}

export interface SendResultMessageParams {
    nonce: number;
    maxFee?: number; // Optional, will query contract if not provided
}

export interface SendStoreOnlyMessageParams {
    messageData: string | number[]; // Hex string, UTF-8 string, or byte array
    maxFee?: number; // Optional, will query contract if not provided
}

export interface TransactionResult {
    txHash: string;
    result: any;
}

/**
 * Message Bridge Contract Wrapper
 *
 * Provides an ethers.js-style interface for interacting with the Neo3 Message Bridge contract.
 * Initialize once with connection details, then call contract methods directly.
 */
export class MessageBridge {
    private config: MessageBridgeConfig;

    constructor(config: MessageBridgeConfig) {
        this.config = config;
    }

    /**
     * Create a MessageBridge instance from environment variables
     */
    static async fromEnvironment(): Promise<MessageBridge> {
        const contractHash = process.env.MESSAGE_BRIDGE_CONTRACT_HASH;
        if (!contractHash) {
            throw new Error('MESSAGE_BRIDGE_CONTRACT_HASH environment variable is required');
        }

        const walletPath = process.env.WALLET_PATH;
        if (!walletPath) {
            throw new Error('WALLET_PATH environment variable is required');
        }

        const walletPassword = process.env.WALLET_PASSWORD || "";
        const rpcUrl = process.env.N3_RPC_URL || 'http://localhost:40332';

        // Load account - always try to decrypt if password is available
        let account = await createDecryptedAccountFromWalletFile(walletPath, walletPassword);

        if (!account) {
            throw new Error('Failed to load account from wallet file');
        }

        return new MessageBridge({
            contractHash,
            rpcUrl,
            account
        });
    }

    /**
     * Send an executable message to the message bridge
     * maxFee is required and must be provided by the caller.
     */
    async sendExecutableMessage(params: SendExecutableMessageParams): Promise<TransactionResult> {
        console.log('=== Message Bridge - Send Executable Message ===');

        let messageData = this.messageToBytes(params.messageData);
        let hexMessage = neonAdapter.utils.ab2hexstring(new Uint8Array(messageData));
        if (hexMessage.startsWith('0x')) hexMessage = hexMessage.slice(2);
        console.log(`[sendExecutableMessage] Message Data (${messageData.length} bytes):`, hexMessage);
        console.log(`[sendExecutableMessage] Store Result: ${params.storeResult}`);

        // Require maxFee to be provided
        if (params.sendingFee === undefined || params.sendingFee === null) {
            throw new Error("maxFee must be provided as the contract does not expose a sendingFee method.");
        }
        const sendingFee = params.sendingFee;
        console.log(`[sendExecutableMessage] Sending Fee: ${sendingFee} (10^-8 GAS units)`);

        // Ensure scriptHash is 40 hex chars, no 0x prefix
        let feeSponsor = this.config.account.scriptHash;
        if (feeSponsor.startsWith('0x')) feeSponsor = feeSponsor.slice(2);
        if (feeSponsor.length !== 40) {
            throw new Error(`[sendExecutableMessage] feeSponsor scriptHash must be 40 hex chars, got: ${feeSponsor}`);
        }

        // Prepare contract parameters
        const args = [
            neonAdapter.create.contractParam('ByteArray', hexMessage),
            neonAdapter.create.contractParam('Boolean', params.storeResult),
            neonAdapter.create.contractParam('Hash160', feeSponsor),
            neonAdapter.create.contractParam('Integer', sendingFee)
        ];
        console.log('[sendExecutableMessage] args:', args.map(a => ({type: a.type, value: a.value})));

        return await this.sendTransaction(
            'sendExecutableMessage',
            args,
            [neonAdapter.constants.NATIVE_CONTRACT_HASH.GasToken]
        );
    }

    /**
     * Send a result message to the message bridge
     * maxFee is required and must be provided by the caller.
     */
    async sendResultMessage(params: SendResultMessageParams): Promise<TransactionResult> {
        console.log('=== Message Bridge - Send Result Message ===');
        console.log(`Related nonce: ${params.nonce}`);

        // Require maxFee to be provided
        if (params.maxFee === undefined || params.maxFee === null) {
            throw new Error("maxFee must be provided as the contract does not expose a sendingFee method.");
        }
        const sendingFee = params.maxFee;
        console.log(`[sendResultMessage] Sending Fee: ${sendingFee} (10^-8 GAS units)`);

        // Ensure scriptHash is 40 hex chars, no 0x prefix
        let feeSponsor = this.config.account.scriptHash;
        if (feeSponsor.startsWith('0x')) feeSponsor = feeSponsor.slice(2);
        if (feeSponsor.length !== 40) {
            throw new Error(`[sendResultMessage] feeSponsor scriptHash must be 40 hex chars, got: ${feeSponsor}`);
        }

        // Prepare contract parameters
        const args = [
            neonAdapter.create.contractParam('Integer', params.nonce),
            neonAdapter.create.contractParam('Hash160', feeSponsor),
            neonAdapter.create.contractParam('Integer', sendingFee)
        ];
        console.log('[sendResultMessage] args:', args.map(a => ({type: a.type, value: a.value})));

        return await this.sendTransaction(
            'sendResultMessage',
            args,
            [neonAdapter.constants.NATIVE_CONTRACT_HASH.GasToken]
        );
    }

    /**
     * Send a store-only message to the message bridge
     * maxFee is required and must be provided by the caller.
     */
    async sendStoreOnlyMessage(params: SendStoreOnlyMessageParams): Promise<TransactionResult> {
        console.log('=== Message Bridge - Send Store-Only Message ===');

        const messageData = this.messageToBytes(params.messageData);
        let hexMessage = neonAdapter.utils.ab2hexstring(new Uint8Array(messageData));
        if (hexMessage.startsWith('0x')) hexMessage = hexMessage.slice(2);
        console.log(`[sendStoreOnlyMessage] Message Data (${messageData.length} bytes):`, hexMessage);

        // Require maxFee to be provided
        if (params.maxFee === undefined || params.maxFee === null) {
            throw new Error("maxFee must be provided as the contract does not expose a sendingFee method.");
        }
        const sendingFee = params.maxFee;
        console.log(`[sendStoreOnlyMessage] Sending Fee: ${sendingFee} (10^-8 GAS units)`);

        // Ensure scriptHash is 40 hex chars, no 0x prefix
        let feeSponsor = this.config.account.scriptHash;
        if (feeSponsor.startsWith('0x')) feeSponsor = feeSponsor.slice(2);
        if (feeSponsor.length !== 40) {
            throw new Error(`[sendStoreOnlyMessage] feeSponsor scriptHash must be 40 hex chars, got: ${feeSponsor}`);
        }

        // Prepare contract parameters
        const args = [
            neonAdapter.create.contractParam('ByteArray', hexMessage),
            neonAdapter.create.contractParam('Hash160', feeSponsor),
            neonAdapter.create.contractParam('Integer', sendingFee)
        ];
        console.log('[sendStoreOnlyMessage] args:', args.map(a => ({type: a.type, value: a.value})));

        return await this.sendTransaction(
            'sendStoreOnlyMessage',
            args,
            [neonAdapter.constants.NATIVE_CONTRACT_HASH.GasToken]
        );
    }

    /**
     * Convert message data to byte array (private helper)
     */
    private messageToBytes(messageData: string | number[]): number[] {
        if (Array.isArray(messageData)) {
            return messageData;
        }

        // messageData is a string - check if it's a valid hex string
        const hexPattern = /^(0x)?[0-9a-fA-F]+$/;
        if (hexPattern.test(messageData)) {
            // Remove 0x prefix if present
            const cleanHex = messageData.startsWith('0x') ? messageData.slice(2) : messageData;
            // Ensure even length for proper hex conversion
            const evenHex = cleanHex.length % 2 === 0 ? cleanHex : '0' + cleanHex;
            const bytes = neonAdapter.utils.hexstring2ab(evenHex);
            return Array.from(new Uint8Array(bytes));
        } else {
            // Treat as UTF-8 string
            console.log('Message is not in hexadecimal format - using UTF-8 bytes');
            const encoder = new TextEncoder();
            const bytes = encoder.encode(messageData);
            return Array.from(bytes);
        }
    }

    /**
     * Get the current sending fee from the contract (read-only)
     */
    async sendingFee(): Promise<number> {
        const rpcClient = neonAdapter.create.rpcClient(this.config.rpcUrl);
        const result = await rpcClient.invokeFunction(
            this.config.contractHash,
            'sendingFee'
        );

        if (result.state !== 'HALT') {
            throw new Error(`Failed to get sending fee: ${result.exception || 'Unknown error'}`);
        }
        if (!result.stack || result.stack.length === 0) {
            throw new Error('No result returned from sendingFee call');
        }
        // For Integer return type
        const feeValue = result.stack[0].value;
        if (feeValue === undefined || feeValue === null) {
            throw new Error('Invalid sending fee value returned from contract');
        }
        return Number(feeValue);
    }

    /**
     * Send transaction to the contract (private helper)
     */
    private async sendTransaction(
        operation: string,
        args: any[],
        allowedContracts: string[] = []
    ): Promise<TransactionResult> {
        console.log(`\n--- Sending ${operation} Transaction ---`);
        console.log(`[sendTransaction] Contract Hash: ${this.config.contractHash}`);
        console.log(`[sendTransaction] Sender Address: ${this.config.account.address}`);
        console.log(`[sendTransaction] Args:`, args.map(a => ({type: a.type, value: a.value})));

        // Create the invocation script using neon-js sc module
        const script = neonAdapter.create.script({
            scriptHash: this.config.contractHash,
            operation: operation,
            args: args
        });

        // Create RPC client for sending the transaction
        const rpcClient = neonAdapter.create.rpcClient(this.config.rpcUrl);

        // Get current block height for transaction validity
        const currentHeight = await rpcClient.getBlockCount();
        const validUntilBlock = currentHeight + 1000; // Valid for 1000 blocks

        // Create transaction
        const tx = neonAdapter.create.transaction({
            signers: [{
                account: this.config.account.scriptHash,
                scopes: allowedContracts.length > 0
                    ? WitnessScope.CustomContracts
                    : WitnessScope.CalledByEntry,
                allowedContracts: allowedContracts
            }],
            validUntilBlock: validUntilBlock,
            script: script
        });

        // --- Network Fee Calculation ---
        const feePerByteResp = await rpcClient.invokeFunction(
            neonAdapter.constants.NATIVE_CONTRACT_HASH.PolicyContract,
            "getFeePerByte"
        );
        let networkFee;
        const feePerByteValue = feePerByteResp.stack && feePerByteResp.stack[0] && (typeof feePerByteResp.stack[0].value === 'string' || typeof feePerByteResp.stack[0].value === 'number')
            ? feePerByteResp.stack[0].value
            : undefined;
        if (feePerByteResp.state !== "HALT" || feePerByteValue === undefined) {
            throw new Error("Unable to retrieve data to calculate network fee.");
        } else {
            const feePerByte = neonAdapter.utils.BigInteger.fromNumber(feePerByteValue);
            const txByteSize = tx.serialize().length / 2 + 109;
            const witnessFee = neonAdapter.utils.BigInteger.fromNumber(1000390);
            networkFee = feePerByte.mul(txByteSize).add(witnessFee);
            tx.networkFee = networkFee;
        }

        // --- System Fee Calculation ---
        const hexContracts = allowedContracts.map(c => neonAdapter.utils.HexString.fromHex(c));
        const txSigner = neonAdapter.create.signer({
            account: neonAdapter.utils.HexString.fromHex(this.config.account.scriptHash),
            scopes: allowedContracts.length > 0
                ? WitnessScope.CustomContracts
                : WitnessScope.CalledByEntry,
            allowedContracts: hexContracts,
            allowedGroups: [],
            rules: [],
        });
        const invokeResp = await rpcClient.invokeScript(
            neonAdapter.utils.HexString.fromHex(tx.script),
            [txSigner]
        );
        if (invokeResp.state !== "HALT") {
            throw new Error(`Transfer script errored out: ${invokeResp.exception}`);
        }
        tx.systemFee = neonAdapter.utils.BigInteger.fromNumber(invokeResp.gasconsumed);

        // --- Balance Checks ---
        let balanceResponse: any;
        try {
            balanceResponse = await rpcClient.execute(
                new neonAdapter.rpcUtils.Query({
                    method: "getnep17balances",
                    params: [this.config.account.address],
                })
            );
        } catch (e) {
            throw new Error("Unable to get balances as plugin was not available.");
        }
        // Check for gas funds for fees
        const gasRequirements = tx.networkFee.add(tx.systemFee);
        const gasBalance = balanceResponse.balance.find((bal: any) =>
            bal.assethash.includes(neonAdapter.constants.NATIVE_CONTRACT_HASH.GasToken)
        );
        const gasAmount = gasBalance
            ? neonAdapter.utils.BigInteger.fromNumber(gasBalance.amount)
            : neonAdapter.utils.BigInteger.fromNumber(0);
        if (gasAmount.compare(gasRequirements) === -1) {
            throw new Error(
                `Insufficient gas to pay for fees! Required ${gasRequirements.toString()} but only had ${gasAmount.toString()}`
            );
        }

        // --- Sign and Send Transaction ---
        const signedTx = tx.sign(this.config.account, this.config.networkMagic || 5195086);
        const result = await rpcClient.sendRawTransaction(
            neonAdapter.utils.HexString.fromHex(signedTx.serialize(true))
        );
        return { txHash: result, result };
    }
}
