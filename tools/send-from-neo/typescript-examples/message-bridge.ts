import { type ContractParam, neonAdapter, QueryLike, WitnessScope } from "./neon-adapter.js";
import {
    type BalanceResponse,
    ContractInvocationError,
    InsufficientFundsError,
    InvalidParameterError,
    type MessageBridgeConfig,
    MessageBridgeError,
    type SendExecutableMessageParams,
    type SendResultMessageParams,
    type SendStoreOnlyMessageParams,
    type TransactionResult
} from "./types.js";

export class MessageBridge {
    private config: MessageBridgeConfig;

    constructor(config: MessageBridgeConfig) {
        this.config = config;
    }

    async sendExecutableMessage(params: SendExecutableMessageParams): Promise<TransactionResult> {
        console.log('=== Message Bridge - Send Executable Message ===');

        let messageData = this.messageToBytes(params.messageData);
        let hexMessage = neonAdapter.utils.ab2hexstring(new Uint8Array(messageData));
        if (hexMessage.startsWith('0x')) hexMessage = hexMessage.slice(2);
        console.log(`[sendExecutableMessage] Message Data (${messageData.length} bytes):`, hexMessage);
        console.log(`[sendExecutableMessage] Store Result: ${params.storeResult}`);

        if (params.sendingFee === undefined || params.sendingFee === null) {
            throw new InvalidParameterError("sendingFee");
        }
        const sendingFee = params.sendingFee;
        console.log(`[sendExecutableMessage] Sending Fee: ${sendingFee} (10^-8 GAS units)`);

        let feeSponsor = this.config.account.scriptHash;
        if (feeSponsor.startsWith('0x')) feeSponsor = feeSponsor.slice(2);
        if (feeSponsor.length !== 40) {
            throw new InvalidParameterError(`feeSponsor`, `40 hex chars`);
        }

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

    async sendResultMessage(params: SendResultMessageParams): Promise<TransactionResult> {
        console.log('=== Message Bridge - Send Result Message ===');
        console.log(`Related nonce: ${params.nonce}`);

        if (params.sendingFee === undefined || params.sendingFee === null) {
            throw new InvalidParameterError("sendingFee");
        }
        const sendingFee = params.sendingFee;
        console.log(`[sendResultMessage] Sending Fee: ${sendingFee} (10^-8 GAS units)`);

        let feeSponsor = this.config.account.scriptHash;
        if (feeSponsor.startsWith('0x')) feeSponsor = feeSponsor.slice(2);
        if (feeSponsor.length !== 40) {
            throw new InvalidParameterError(`feeSponsor`, `40 hex chars`);
        }

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

    async sendStoreOnlyMessage(params: SendStoreOnlyMessageParams): Promise<TransactionResult> {
        console.log('=== Message Bridge - Send Store-Only Message ===');

        const messageData = this.messageToBytes(params.messageData);
        let hexMessage = neonAdapter.utils.ab2hexstring(new Uint8Array(messageData));
        if (hexMessage.startsWith('0x')) hexMessage = hexMessage.slice(2);
        console.log(`[sendStoreOnlyMessage] Message Data (${messageData.length} bytes):`, hexMessage);

        if (params.sendingFee === undefined || params.sendingFee === null) {
            throw new InvalidParameterError("sendingFee");
        }
        const sendingFee = params.sendingFee;
        console.log(`[sendStoreOnlyMessage] Sending Fee: ${sendingFee} (10^-8 GAS units)`);

        let feeSponsor = this.config.account.scriptHash;
        if (feeSponsor.startsWith('0x')) feeSponsor = feeSponsor.slice(2);
        if (feeSponsor.length !== 40) {
            throw new InvalidParameterError(`feeSponsor`, `40 hex chars`);
        }

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

    async sendingFee(): Promise<number> {
        const rpcClient = neonAdapter.create.rpcClient(this.config.rpcUrl);
        const result = await rpcClient.invokeFunction(
            this.config.contractHash,
            'sendingFee'
        );

        if (result.state !== 'HALT') {
            throw new ContractInvocationError(
                `Failed to get sending fee: contract execution failed`,
                result.exception || 'Unknown error'
            );
        }

        if (!result.stack || result.stack.length === 0) {
            throw new ContractInvocationError('No result returned from sendingFee call');
        }

        const feeValue = result.stack[0].value;
        if (feeValue === undefined || feeValue === null) {
            throw new ContractInvocationError('Invalid sending fee value returned from contract');
        }

        return Number(feeValue);
    }

    private async sendTransaction(
        operation: string,
        args: ContractParam[],
        allowedContracts: string[] = []
    ): Promise<TransactionResult> {
        console.log(`\n--- Sending ${operation} Transaction ---`);
        console.log(`[sendTransaction] Contract Hash: ${this.config.contractHash}`);
        console.log(`[sendTransaction] Sender Address: ${this.config.account.address}`);
        console.log(`[sendTransaction] Args:`, args.map(a => ({type: a.type, value: a.value})));

        const script = neonAdapter.create.script({
            scriptHash: this.config.contractHash,
            operation: operation,
            args: args
        });

        const rpcClient = neonAdapter.create.rpcClient(this.config.rpcUrl);

        const currentHeight = await rpcClient.getBlockCount();
        const validUntilBlock = currentHeight + 1000;

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

        const feePerByteResp = await rpcClient.invokeFunction(
            neonAdapter.constants.NATIVE_CONTRACT_HASH.PolicyContract,
            "getFeePerByte"
        );
        let networkFee;
        const feePerByteValue = feePerByteResp.stack && feePerByteResp.stack[0] && (typeof feePerByteResp.stack[0].value === 'string' || typeof feePerByteResp.stack[0].value === 'number')
            ? feePerByteResp.stack[0].value
            : undefined;
        if (feePerByteResp.state !== "HALT" || feePerByteValue === undefined) {
            throw new ContractInvocationError("Unable to retrieve network fee data from PolicyContract");
        } else {
            const feePerByte = neonAdapter.utils.BigInteger.fromNumber(feePerByteValue);
            const txByteSize = tx.serialize().length / 2 + 109;
            const witnessFee = neonAdapter.utils.BigInteger.fromNumber(1000390);
            networkFee = feePerByte.mul(txByteSize).add(witnessFee);
            tx.networkFee = networkFee;
        }

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
            throw new ContractInvocationError(`Transaction script execution failed`, invokeResp.exception || 'Unknown error');
        }
        tx.systemFee = neonAdapter.utils.BigInteger.fromNumber(invokeResp.gasconsumed);

        let balanceResponse: BalanceResponse;
        try {
            let req: QueryLike<any> = {
                method: "getnep17balances",
                params: [this.config.account.address],
                id: 1,
                jsonrpc: "2.0"
            };
            balanceResponse = await rpcClient.execute<BalanceResponse>(
                neonAdapter.create.query(req)
            );
        } catch (e) {
            throw new MessageBridgeError("Unable to get balances: RPC plugin not available", "BALANCE_CHECK_FAILED");
        }
        const gasRequirements = tx.networkFee.add(tx.systemFee);
        const gasBalance = balanceResponse.balance.find((bal) =>
            bal.assethash.includes(neonAdapter.constants.NATIVE_CONTRACT_HASH.GasToken)
        );
        const gasAmount = gasBalance
            ? neonAdapter.utils.BigInteger.fromNumber(gasBalance.amount)
            : neonAdapter.utils.BigInteger.fromNumber(0);
        if (gasAmount.compare(gasRequirements) === -1) {
            throw new InsufficientFundsError(
                `Insufficient gas to pay for transaction fees`,
                gasRequirements.toString(),
                gasAmount.toString()
            );
        }

        const signedTx = tx.sign(this.config.account, this.config.networkMagic || 5195086);
        const result = await rpcClient.sendRawTransaction(
            neonAdapter.utils.HexString.fromHex(signedTx.serialize(true))
        );
        return {txHash: result};
    }
}
