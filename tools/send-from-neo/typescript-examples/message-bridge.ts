import { neonAdapter } from "./neo/neon-adapter";
import {
    ContractInvocationError,
    InvalidParameterError,
    type MessageBridgeConfig,
    type SendExecutableMessageParams,
    type SendResultMessageParams,
    type SendStoreOnlyMessageParams,
    type TransactionResult
} from "./types";
import { invokeMethod } from "./neo/rpc-utils";
import { sendContractTransaction } from "./neo/neo-utils";
import { BasicParams, MessageParams } from "./types/interfaces";

export class MessageBridge {
    private readonly sendingFeeMethod = 'sendingFee';

    private config: MessageBridgeConfig;
    private readonly rpcClient;

    constructor(config: MessageBridgeConfig) {
        this.config = config;
        this.rpcClient = neonAdapter.create.rpcClient(config.rpcUrl);
        console.log(`Initialized MessageBridge with RPC URL: ${config.rpcUrl}`);
        this.rpcClient.getVersion().then(v => console.log(`Magic Number: ${v.protocol.network}`));
        console.log(`Contract Hash: ${config.contractHash}`);
        console.log(`Sender Account: ${config.account.address}`);

    }

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

        const method = 'sendExecutableMessage';
        return await sendContractTransaction(
            this.rpcClient,
            this.config.account,
            this.config.contractHash,
            method,
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

        const method = 'sendResultMessage';
        return await sendContractTransaction(
            this.rpcClient,
            this.config.account,
            this.config.contractHash,
            method,
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

        const method = 'sendStoreOnlyMessage';
        return await sendContractTransaction(
            this.rpcClient,
            this.config.account,
            this.config.contractHash,
            method,
            args,
            [neonAdapter.constants.NATIVE_CONTRACT_HASH.GasToken]
        );
    }

    async sendingFee(): Promise<number> {
        const result = await invokeMethod(this.rpcClient, this.config.contractHash, this.sendingFeeMethod);

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
