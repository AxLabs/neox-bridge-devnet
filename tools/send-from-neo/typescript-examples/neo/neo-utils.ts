import { invokeMethod, invokeScript } from "./rpc-utils";
import {
    Account,
    type ContractParam,
    type HexString,
    neonAdapter,
    RPCClient,
    Signer,
    WitnessScope
} from "./neon-adapter";
import { ContractInvocationError, InsufficientFundsError, type TransactionResult } from "../types";
import { QueryLike } from "@cityofzion/neon-core/lib/rpc/Query";
import { RpcQueryError } from "../types/errors";

interface AssetBalance {
    assethash: string;
    amount: string;
    lastupdatedblock: number;
}

interface BalanceResponse {
    balance: Array<AssetBalance>;
}

export async function getGasBalance(rpcClient: RPCClient, accountAddress: string) {
    let balanceResponse: BalanceResponse;
    const getNep17balances = "getnep17balances";
    try {
        let req: QueryLike<any> = {
            method: getNep17balances,
            params: [accountAddress],
            id: 1,
            jsonrpc: "2.0"
        };
        balanceResponse = await rpcClient.execute<BalanceResponse>(
            neonAdapter.create.query(req)
        );
    } catch (e) {
        throw new RpcQueryError("Unable to get balances: RPC plugin not available", getNep17balances);
    }
    return balanceResponse.balance.find((bal) =>
        bal.assethash.includes(neonAdapter.constants.NATIVE_CONTRACT_HASH.GasToken)
    )?.amount;
}

export async function getFeePerByte(rpcClient: RPCClient) {
    let methodName = "getFeePerByte";
    const errorMessage = "Unable to retrieve network fee data from PolicyContract";
    const response = await invokeMethod(rpcClient, neonAdapter.constants.NATIVE_CONTRACT_HASH.PolicyContract, methodName, errorMessage);
    if (typeof response !== 'string' && typeof response !== 'number') {
        throw new ContractInvocationError(errorMessage);
    }
    return neonAdapter.utils.BigInteger.fromNumber(response);
}

export async function getSystemFee(rpcClient: RPCClient, script: HexString, txSigners: Signer[]) {
    const invokeResp = await invokeScript(
        rpcClient,
        script,
        txSigners
    );
    return neonAdapter.utils.BigInteger.fromNumber(invokeResp.gasconsumed);
}

export async function sendContractTransaction(
    rpcClient: RPCClient,
    sender: Account,
    contractHash: string,
    method: string,
    args: ContractParam[],
    allowedContracts: string[] = []
): Promise<TransactionResult> {
    const script = neonAdapter.create.script({
        scriptHash: contractHash,
        operation: method,
        args: args
    });

    // Set valid until block to 1000 blocks in the future
    const validUntilBlock = await rpcClient.getBlockCount() + 1000;
    const tx = neonAdapter.create.transaction({
        signers: [{
            account: sender.scriptHash,
            scopes: allowedContracts.length > 0
                ? WitnessScope.CustomContracts
                : WitnessScope.CalledByEntry,
            allowedContracts: allowedContracts
        }],
        validUntilBlock: validUntilBlock,
        script: script
    });

    // Create signer
    const hexContracts = allowedContracts.map(c => neonAdapter.utils.HexString.fromHex(c));
    const txSigner = neonAdapter.create.signer({
        account: neonAdapter.utils.HexString.fromHex(sender.scriptHash),
        scopes: allowedContracts.length > 0
            ? WitnessScope.CustomContracts
            : WitnessScope.CalledByEntry,
        allowedContracts: hexContracts,
        allowedGroups: [],
        rules: [],
    });

    // Calculate fees
    tx.systemFee = await getSystemFee(rpcClient, tx.script, [txSigner]);
    tx.networkFee = await getNetworkFee(rpcClient, tx.serialize().length);
    const gasRequirements = tx.networkFee.add(tx.systemFee);

    // Check sender has enough GAS to cover fees
    const gasBalance = await getGasBalance(rpcClient, sender.address);
    const gasAmount = gasBalance
        ? neonAdapter.utils.BigInteger.fromNumber(gasBalance)
        : neonAdapter.utils.BigInteger.fromNumber(0);
    if (gasAmount.compare(gasRequirements) === -1) {
        throw new InsufficientFundsError(
            `Insufficient gas to pay for transaction fees`,
            gasRequirements.toString(),
            gasAmount.toString()
        );
    }

    // Sign and send transaction
    let magicNumber = await rpcClient.getVersion();
    const signedTx = tx.sign(sender, magicNumber.protocol.network);
    const result = await rpcClient.sendRawTransaction(
        neonAdapter.utils.HexString.fromHex(signedTx.serialize(true))
    );
    return {txHash: result};
}

async function getNetworkFee(rpcClient: RPCClient, transactionByteSize: number) {
    const feePerByte = await getFeePerByte(rpcClient);
    const txByteSize = transactionByteSize / 2 + 109;
    // TODO: Verify witness fee calculation - this is just a random value that works for testing
    const witnessFee = neonAdapter.utils.BigInteger.fromNumber(1000390);
    return feePerByte.mul(txByteSize).add(witnessFee);
}
