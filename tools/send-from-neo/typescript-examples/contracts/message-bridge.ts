import { ContractParam, neonAdapter } from "../neo/neon-adapter";
import {
    InvalidParameterError,
    type MessageBridgeConfig,
    type SendExecutableMessageParams,
    type SendResultMessageParams,
    type SendStoreOnlyMessageParams,
    type TransactionResult
} from "../types";
import { invokeMethod } from "../neo/rpc-utils";
import { sendContractTransaction } from "../neo/neo-utils";
import { BasicParams, MessageParams } from "../types/interfaces";
import { ContractParamJson } from "@cityofzion/neon-core/lib/sc/ContractParam";

export class MessageBridge {

    readonly rpcClient;
    private config: MessageBridgeConfig;

    constructor(config: MessageBridgeConfig) {
        this.config = config;
        this.rpcClient = neonAdapter.create.rpcClient(config.rpcUrl);
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

    async getMessageBridge(): Promise<any> {
        return await this.getObjectValue(this.getMessageBridge.name);
    }

    async executionManager(): Promise<string> {
        return await this.getHexValue(this.executionManager.name);
    }
    // endregion

    // region send messages
    async sendExecutableMessage(params: SendExecutableMessageParams): Promise<TransactionResult> {
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
        const params = [
            neonAdapter.create.contractParam('Hash160', target.startsWith('0x') ? target.slice(2) : target),
            neonAdapter.create.contractParam('String', method),
            neonAdapter.create.contractParam('Integer', callFlags),
            neonAdapter.create.contractParam('Array', args)
        ];

        return await this.getHexValue(this.serializeCall.name, params);
    }
    // endregion

    // region execute
    async executeMessage(nonce: number): Promise<TransactionResult> {
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
    async getMessage(nonce: number): Promise<any> {
        const params = [
            neonAdapter.create.contractParam('Integer', nonce)
        ];
        return await this.getObjectValue(this.getMessage.name, params);
    }

    async getMetadata(nonce: number): Promise<any> {
        const params = [
            neonAdapter.create.contractParam('Integer', nonce)
        ];

        return await this.getObjectValue(this.getMetadata.name, params);
    }

    async getExecutableState(nonce: number): Promise<any> {
        const params = [
            neonAdapter.create.contractParam('Integer', nonce)
        ];

        return await this.getObjectValue(this.getExecutableState.name, params);
    }

    async getEvmExecutionResult(relatedNeoToEvmMessageNonce: number): Promise<string> {
        const params = [
            neonAdapter.create.contractParam('Integer', relatedNeoToEvmMessageNonce)
        ];

        return await this.getHexValue(this.getEvmExecutionResult.name, params);
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

    // region private helpers
    private async getBooleanValue(methodName: string) {
        return Boolean(await this.getStackValue(methodName));
    }

    private async getNumberValue(methodName: string) {
        return Number(await this.getStackValue(methodName));
    }

    private async getStringValue(methodName: string, params?: ContractParam[]) {
        const result = await this.getStackValue(methodName, params);

        if (typeof result === 'string') {
            let hexString = neonAdapter.utils.base642hex(result);
            return neonAdapter.utils.hexstring2str(hexString);
        } else {
            return String(result);
        }
    }

    private async getHexValue(methodName: string, params?: ContractParam[]) {
        const result = await this.getStackValue(methodName, params);

        if (typeof result === 'string') {
            return `0x${neonAdapter.utils.base642hex(result)}`;
        } else {
            return String(result);
        }
    }

    private async getObjectValue(methodName: string, params?: ContractParam[]) {
        const result = await this.getStackValue(methodName, params);

        // If it's an array of StackItemJson objects, decode each one
        if (Array.isArray(result)) {
            return result.map(item => this.decodeStackItem(item, methodName));
        }

        return this.decodeStackItem(result, methodName);
    }

    private decodeStackItem(item: any, methodName?: string): any {
        // log the item type for debugging
        if (methodName) {
            console.log(`[${methodName}] Decoding StackItem of type: ${item && typeof item === 'object' && 'type' in item ? item.type : 'unknown'}`);
        }

        if (Array.isArray(item)) {
            return item.map(nestedItem => this.decodeStackItem(nestedItem, methodName));
        }

        if (item && typeof item === 'object' && 'type' in item && 'value' in item) {
            const { type, value } = item;

            // Handle different types
            switch (type) {
                case 'Array':
                    // Recursively decode array elements
                    if (Array.isArray(value)) {
                        return value.map(nestedItem => this.decodeStackItem(nestedItem, methodName));
                    }
                    return value;
                case 'ByteString':
                case 'Buffer':
                case 'Pointer':
                    if (typeof value === 'string') {
                        // Convert base64 to hex
                        try {
                            return `0x${neonAdapter.utils.base642hex(value)}`;
                        } catch {
                            return value;
                        }
                    }
                    return value;
                case 'Integer':
                    return Number(value);
                case 'Boolean':
                    return Boolean(value);
                case 'Null':
                    return null;
                default:
                    return value;
            }
        }

        return item;
    }


    private async getStackValue(methodName: string, params?: ContractParam[]) {
        let errorMessage = `Invalid ${methodName} value returned from contract`;

        return await invokeMethod(this.rpcClient, this.config.contractHash, methodName, errorMessage, params || []);
    }

    private getValidSponsor() {
        let feeSponsor = this.config.account.scriptHash;
        if (feeSponsor.startsWith('0x')) feeSponsor = feeSponsor.slice(2);
        if (feeSponsor.length !== 40) {
            throw new InvalidParameterError(`feeSponsor`, `40 hex chars`);
        }
        return feeSponsor;
    }

    private getValidMaxFee(params: BasicParams) {
        if (params.sendingFee === undefined || params.sendingFee === null) {
            throw new InvalidParameterError("sendingFee");
        }
        return params.sendingFee;
    }

    private getValidRawMessage(params: MessageParams) {
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
