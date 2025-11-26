import { neonAdapter } from "../neo/neon-adapter";
import {
    type ContractWrapperConfig,
    type ExecutableState,
    InvalidParameterError,
    type MessageBridgeConfigData,
    type MessageBridgeData,
    type NeoMessage,
    type NeoMetadataUnion,
    type SendExecutableMessageParams,
    type SendResultMessageParams,
    type SendStoreOnlyMessageParams,
    type State,
    type TransactionResult
} from "../types";
import { sendContractTransaction } from "../neo/neo-utils";
import { BasicParams, MessageParams } from "../types/interfaces";
import { ContractParamJson } from "@cityofzion/neon-core/lib/sc/ContractParam";
import { AbstractContract } from "./abstract-contract";

export class MessageBridge extends AbstractContract {

    constructor(config: ContractWrapperConfig) {
        super(config);
        console.log(`[MB] Initialized MessageBridge with RPC URL: ${config.rpcUrl}`);
        this.rpcClient.getVersion().then(v => console.log(`[MB] Magic Number: ${v.protocol.network}`));
        console.log(`[MB] Contract Hash: ${config.contractHash}`);
        console.log(`[MB] Sender Account: ${config.account.address}`);
    }

    // region contract info
    async version(): Promise<string> {
        return await this.getStringValue(this.version.name);
    }

    async linkedChainId(): Promise<number> {
        return await this.getNumberValue(this.linkedChainId.name);
    }

    // endregion

    // region pause
    async isPaused(): Promise<boolean> {
        return await this.getBooleanValue(this.isPaused.name);
    }

    async sendingIsPaused(): Promise<boolean> {
        return await this.getBooleanValue(this.sendingIsPaused.name);
    }

    async executingIsPaused(): Promise<boolean> {
        return await this.getBooleanValue(this.executingIsPaused.name);
    }

    async pause(): Promise<TransactionResult> {
        return await sendContractTransaction(
            this.rpcClient,
            this.config.account,
            this.config.contractHash,
            this.pause.name,
            [],
            []
        );
    }

    async unpause(): Promise<TransactionResult> {
        return await sendContractTransaction(
            this.rpcClient,
            this.config.account,
            this.config.contractHash,
            this.unpause.name,
            [],
            []
        );
    }

    async pauseSending(): Promise<TransactionResult> {
        return await sendContractTransaction(
            this.rpcClient,
            this.config.account,
            this.config.contractHash,
            this.pauseSending.name,
            [],
            []
        );
    }

    async unpauseSending(): Promise<TransactionResult> {
        return await sendContractTransaction(
            this.rpcClient,
            this.config.account,
            this.config.contractHash,
            this.unpauseSending.name,
            [],
            []
        );
    }

    async pauseExecuting(): Promise<TransactionResult> {
        return await sendContractTransaction(
            this.rpcClient,
            this.config.account,
            this.config.contractHash,
            this.pauseExecuting.name,
            [],
            []
        );
    }

    async unpauseExecuting(): Promise<TransactionResult> {
        return await sendContractTransaction(
            this.rpcClient,
            this.config.account,
            this.config.contractHash,
            this.unpauseExecuting.name,
            [],
            []
        );
    }

    // endregion

    // region fees
    async sendingFee(): Promise<number> {
        return await this.getNumberValue(this.sendingFee.name);
    }

    async unclaimedFees(): Promise<number> {
        return await this.getNumberValue(this.unclaimedFees.name);
    }

    // endregion

    // region contracts
    async management(): Promise<string> {
        return await this.getHexValue(this.management.name);
    }

    async executionManager(): Promise<string> {
        return await this.getHexValue(this.executionManager.name);
    }

    // endregion

    // region send messages
    async sendExecutableMessage(params: SendExecutableMessageParams): Promise<TransactionResult> {
        this.validateMessageParams(params, this.sendExecutableMessage.name);

        let feeSponsor = this.getValidSponsor();
        const maxFee = this.getValidMaxFee(params);
        let rawMessage = this.getValidRawMessage(params);

        const args = [
            neonAdapter.create.contractParam('ByteArray', rawMessage),
            neonAdapter.create.contractParam('Boolean', params.storeResult),
            neonAdapter.create.contractParam('Hash160', feeSponsor),
            neonAdapter.create.contractParam('Integer', maxFee)
        ];

        return await sendContractTransaction(
            this.rpcClient,
            this.config.account,
            this.config.contractHash,
            this.sendExecutableMessage.name,
            args,
            [neonAdapter.constants.NATIVE_CONTRACT_HASH.GasToken]
        );
    }

    async sendResultMessage(params: SendResultMessageParams): Promise<TransactionResult> {
        this.validateResultMessageParams(params, this.sendResultMessage.name);

        let feeSponsor = this.getValidSponsor();
        const maxFee = this.getValidMaxFee(params);
        const args = [
            neonAdapter.create.contractParam('Integer', params.nonce),
            neonAdapter.create.contractParam('Hash160', feeSponsor),
            neonAdapter.create.contractParam('Integer', maxFee)
        ];

        return await sendContractTransaction(
            this.rpcClient,
            this.config.account,
            this.config.contractHash,
            this.sendResultMessage.name,
            args,
            [neonAdapter.constants.NATIVE_CONTRACT_HASH.GasToken]
        );
    }

    async sendStoreOnlyMessage(params: SendStoreOnlyMessageParams): Promise<TransactionResult> {
        this.validateMessageParams(params, this.sendStoreOnlyMessage.name);

        let feeSponsor = this.getValidSponsor();
        const maxFee = this.getValidMaxFee(params);
        let rawMessage = this.getValidRawMessage(params);

        const args = [
            neonAdapter.create.contractParam('ByteArray', rawMessage),
            neonAdapter.create.contractParam('Hash160', feeSponsor),
            neonAdapter.create.contractParam('Integer', maxFee)
        ];

        return await sendContractTransaction(
            this.rpcClient,
            this.config.account,
            this.config.contractHash,
            this.sendStoreOnlyMessage.name,
            args,
            [neonAdapter.constants.NATIVE_CONTRACT_HASH.GasToken]
        );
    }

    // endregion

    // region utils
    async serializeCall(target: string, method: string, callFlags: number, args: ContractParamJson[]): Promise<string> {
        this.validateScriptHash(target, this.serializeCall.name);
        this.validateCallFlags(callFlags, this.serializeCall.name);

        if (!Array.isArray(args)) {
            throw new InvalidParameterError('args for serializeCall', `array value, got ${typeof args}`);
        }

        const params = [
            neonAdapter.create.contractParam('Hash160', target.startsWith('0x') ? target.slice(2) : target),
            neonAdapter.create.contractParam('String', method),
            neonAdapter.create.contractParam('Integer', callFlags),
            neonAdapter.create.contractParam('Array', args)
        ];

        return await this.getHexValue(this.serializeCall.name, params);
    }

    async getMessageBridge(): Promise<MessageBridgeData> {
        const rawData = await this.getObjectValue(this.getMessageBridge.name);

        if (!Array.isArray(rawData) || rawData.length !== 3) {
            throw new Error('Invalid MessageBridge data structure received');
        }

        const [evmToNeoData, neoToEvmData, configData] = rawData as [unknown[], unknown[], unknown[]];

        // Map evmToNeoState
        if (!Array.isArray(evmToNeoData) || evmToNeoData.length < 2) {
            throw new Error('Invalid evmToNeoData structure received');
        }
        const evmToNeoState: State = {
            nonce: typeof evmToNeoData[0] === 'number' ? evmToNeoData[0] : Number(evmToNeoData[0]),
            root: typeof evmToNeoData[1] === 'string' ? evmToNeoData[1] : String(evmToNeoData[1])
        };

        // Map neoToEvmState
        if (!Array.isArray(neoToEvmData) || neoToEvmData.length < 2) {
            throw new Error('Invalid neoToEvmData structure received');
        }
        const neoToEvmState: State = {
            nonce: typeof neoToEvmData[0] === 'number' ? neoToEvmData[0] : Number(neoToEvmData[0]),
            root: typeof neoToEvmData[1] === 'string' ? neoToEvmData[1] : String(neoToEvmData[1])
        };

        // Map config
        if (!Array.isArray(configData) || configData.length < 5) {
            throw new Error('Invalid configData structure received');
        }
        const config: MessageBridgeConfigData = {
            sendingFee: typeof configData[0] === 'number' ? configData[0] : Number(configData[0]),
            maxMessageSize: typeof configData[1] === 'number' ? configData[1] : Number(configData[1]),
            maxNrMessages: typeof configData[2] === 'number' ? configData[2] : Number(configData[2]),
            executionManager: typeof configData[3] === 'string' ? configData[3] : String(configData[3]),
            executionWindowMilliseconds: typeof configData[4] === 'number' ? configData[4] : Number(configData[4])
        };

        return {
            evmToNeoState,
            neoToEvmState,
            config
        };
    }

    // endregion

    // region execute
    async executeMessage(nonce: number): Promise<TransactionResult> {
        this.validateUint(nonce, this.executeMessage.name);

        const params = [
            neonAdapter.create.contractParam('Integer', nonce)
        ];

        return await sendContractTransaction(
            this.rpcClient,
            this.config.account,
            this.config.contractHash,
            this.executeMessage.name,
            params,
            [neonAdapter.constants.NATIVE_CONTRACT_HASH.GasToken]
        );
    }

    // endregion

    // region getters
    async getMessage(nonce: number): Promise<NeoMessage> {
        this.validateUint(nonce, this.getMessage.name);

        const params = [
            neonAdapter.create.contractParam('Integer', nonce)
        ];
        const rawData = await this.getObjectValue(this.getMessage.name, params);

        if (!Array.isArray(rawData) || rawData.length !== 2) {
            throw new Error('Invalid NeoMessage data structure received');
        }

        const [metadataBytes, rawMessage] = rawData;

        return {
            metadataBytes: typeof metadataBytes === 'string' ? metadataBytes : String(metadataBytes),
            rawMessage: typeof rawMessage === 'string' ? rawMessage : String(rawMessage)
        };
    }

    async getMetadata(nonce: number): Promise<NeoMetadataUnion> {
        this.validateUint(nonce, this.getMetadata.name);

        const params = [
            neonAdapter.create.contractParam('Integer', nonce)
        ];

        const rawData = await this.getObjectValue(this.getMetadata.name, params);

        if (!Array.isArray(rawData) || rawData.length < 3) {
            throw new Error('Invalid metadata data structure received');
        }

        const type = typeof rawData[0] === 'number' ? rawData[0] : Number(rawData[0]);
        const timestamp = typeof rawData[1] === 'number' ? rawData[1] : Number(rawData[1]);
        const sender = typeof rawData[2] === 'string' ? rawData[2] : String(rawData[2]);

        // Base metadata properties
        const baseMetadata = {
            type,
            timestamp,
            sender
        };

        // Type-specific mapping based on the type field
        switch (type) {
            case 0: // MESSAGE_TYPE_EXECUTABLE
                if (rawData.length < 4) {
                    throw new Error('Invalid executable metadata structure received');
                }
                const storeResult = typeof rawData[3] === 'boolean' ? rawData[3] : Boolean(rawData[3]);
                return {
                    ...baseMetadata,
                    type: 0 as const,
                    storeResult
                };

            case 1: // MESSAGE_TYPE_STORE_ONLY
                return {
                    ...baseMetadata,
                    type: 1 as const
                };

            case 2: // MESSAGE_TYPE_RESULT
                if (rawData.length < 4) {
                    throw new Error('Invalid result metadata structure received');
                }
                const initialMessageNonce = typeof rawData[3] === 'number' ? rawData[3] : Number(rawData[3]);
                return {
                    ...baseMetadata,
                    type: 2 as const,
                    initialMessageNonce
                };

            default:
                throw new Error(`Unknown metadata type: ${type}`);
        }
    }

    async getExecutableState(nonce: number): Promise<ExecutableState> {
        this.validateUint(nonce, 'getExecutableState');

        const params = [
            neonAdapter.create.contractParam('Integer', nonce)
        ];

        const rawData = await this.getObjectValue(this.getExecutableState.name, params);

        if (!Array.isArray(rawData) || rawData.length !== 2) {
            throw new Error('Invalid ExecutableState data structure received');
        }

        const [executed, expirationTime] = rawData;

        return {
            executed: typeof executed === 'boolean' ? executed : Boolean(executed),
            expirationTime: typeof expirationTime === 'number' ? expirationTime : Number(expirationTime)
        };
    }

    async getEvmExecutionResult(relatedNeoToEvmMessageNonce: number): Promise<string> {
        this.validateUint(relatedNeoToEvmMessageNonce, this.getEvmExecutionResult.name);

        const params = [
            neonAdapter.create.contractParam('Integer', relatedNeoToEvmMessageNonce)
        ];

        return await this.getHexValue(this.getEvmExecutionResult.name, params);
    }

    async getNeoExecutionResult(relatedEvmToNeoMessageNonce: number): Promise<string> {
        this.validateUint(relatedEvmToNeoMessageNonce, this.getNeoExecutionResult.name);

        const params = [
            neonAdapter.create.contractParam('Integer', relatedEvmToNeoMessageNonce)
        ];

        return await this.getHexValue(this.getNeoExecutionResult.name, params);
    }

    // endregion

    // region states
    async neoToEvmNonce(): Promise<number> {
        return await this.getNumberValue(this.neoToEvmNonce.name);
    }

    async neoToEvmRoot(): Promise<string> {
        return await this.getHexValue(this.neoToEvmRoot.name);
    }

    async evmToNeoNonce(): Promise<number> {
        return await this.getNumberValue(this.evmToNeoNonce.name);
    }

    async evmToNeoRoot(): Promise<string> {
        return await this.getHexValue(this.evmToNeoRoot.name);
    }

    // endregion

    // region parameter validation
    private validateMessageParams(params: SendExecutableMessageParams | SendStoreOnlyMessageParams, methodName: string): void {
        if (!params) {
            throw new InvalidParameterError(`params for ${methodName}`, `non-null object`);
        }

        this.validateUint(params.maxFee, "maxFee");

        if (!params.messageData) {
            throw new InvalidParameterError(`messageData for ${methodName}`, `non-empty value`);
        }

        if (typeof params.messageData === 'string') {
            // First check if string is empty after trimming
            if (params.messageData.trim().length === 0) {
                throw new InvalidParameterError(`messageData for ${methodName}`, `non-empty string`);
            }

        } else if (Array.isArray(params.messageData)) {
            if (params.messageData.length === 0) {
                throw new InvalidParameterError(`messageData for ${methodName}`, `non-empty byte array`);
            }
            if (!params.messageData.every(b => Number.isInteger(b) && b >= 0 && b <= 255)) {
                throw new InvalidParameterError(`messageData for ${methodName}`, `array of bytes (0-255)`);
            }
        } else {
            throw new InvalidParameterError(`messageData for ${methodName}`, `string or byte array, got ${typeof params.messageData}`);
        }
    }

    private validateResultMessageParams(params: SendResultMessageParams, methodName: string): void {
        if (!params) {
            throw new InvalidParameterError(`params for ${methodName}`, `non-null object`);
        }

        this.validateUint(params.nonce, methodName);
    }

    private getValidSponsor(): string {
        this.validateScriptHash(this.config.account.scriptHash, 'feeSponsor');
        return this.config.account.scriptHash;
    }

    private getValidMaxFee(params: BasicParams): number {
        this.validateUint(params.maxFee, "maxFee");
        return params.maxFee;
    }

    private getValidRawMessage(params: MessageParams): string {
        let messageData = this.messageToBytes(params.messageData);
        return neonAdapter.utils.ab2hexstring(new Uint8Array(messageData));
    }

    private messageToBytes(messageData: string | number[]): number[] {
        if (Array.isArray(messageData)) {
            return messageData;
        }

        const hexPattern = /^(0x)?[0-9a-fA-F]+$/;
        if (hexPattern.test(messageData)) {
            const cleanHex = messageData.startsWith('0x') ? messageData.slice(2) : messageData;
            const evenHex = cleanHex.length % 2 === 0 ? cleanHex : '0' + cleanHex;
            const bytes = neonAdapter.utils.hexstring2ab(evenHex);
            return Array.from(new Uint8Array(bytes));
        } else {
            console.log('Message is not in hexadecimal format - using UTF-8 bytes');
            const encoder = new TextEncoder();
            const bytes = encoder.encode(messageData);
            return Array.from(bytes);
        }
    }

    // endregion
}
