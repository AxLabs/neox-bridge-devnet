import { neonAdapter } from "../neo/neon-adapter";
import {
    ContractInvocationError,
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

export class MessageBridge {

    private config: MessageBridgeConfig;
    private readonly rpcClient;

    constructor(config: MessageBridgeConfig) {
        this.config = config;
        this.rpcClient = neonAdapter.create.rpcClient(config.rpcUrl);
        console.log(`[MB] Initialized MessageBridge with RPC URL: ${config.rpcUrl}`);
        this.rpcClient.getVersion().then(v => console.log(`[MB] Magic Number: ${v.protocol.network}`));
        console.log(`[MB] Contract Hash: ${config.contractHash}`);
        console.log(`[MB] Sender Account: ${config.account.address}`);
    }

    // region version
    async version(): Promise<string> {
        const result = await invokeMethod(this.rpcClient, this.config.contractHash, this.version.name);

        const versionValue = result.stack[0].value;
        if (versionValue === undefined || versionValue === null) {
            throw new ContractInvocationError('Invalid version value returned from contract');
        }

        if (typeof versionValue === 'string') {
            try {
                // Try to decode as base64 first
                return atob(versionValue);
            } catch {
                try {
                    // Fallback to hex decoding if base64 fails
                    return neonAdapter.utils.hexstring2str(versionValue);
                } catch {
                    // If both fail, return as string
                    return String(versionValue);
                }
            }
        } else {
            return String(versionValue);
        }
    }
    // endregion

    // region pause
    async isPaused(): Promise<boolean> {
        const result = await invokeMethod(this.rpcClient, this.config.contractHash, this.isPaused.name);

        const pausedValue = result.stack[0].value;
        if (pausedValue === undefined || pausedValue === null) {
            throw new ContractInvocationError('Invalid isPaused value returned from contract');
        }

        return Boolean(pausedValue);
    }

    async sendingIsPaused(): Promise<boolean> {
        const result = await invokeMethod(this.rpcClient, this.config.contractHash, this.sendingIsPaused.name);

        const pausedValue = result.stack[0].value;
        if (pausedValue === undefined || pausedValue === null) {
            throw new ContractInvocationError('Invalid sendingIsPaused value returned from contract');
        }

        return Boolean(pausedValue);
    }

    async executingIsPaused(): Promise<boolean> {
        const result = await invokeMethod(this.rpcClient, this.config.contractHash, this.executingIsPaused.name);

        const pausedValue = result.stack[0].value;
        if (pausedValue === undefined || pausedValue === null) {
            throw new ContractInvocationError('Invalid executingIsPaused value returned from contract');
        }

        return Boolean(pausedValue);
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

    async sendingFee(): Promise<number> {
        const result = await invokeMethod(this.rpcClient, this.config.contractHash, this.sendingFee.name);

        const feeValue = result.stack[0].value;
        if (feeValue === undefined || feeValue === null) {
            throw new ContractInvocationError('Invalid sending fee value returned from contract');
        }

        return Number(feeValue);
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
}
