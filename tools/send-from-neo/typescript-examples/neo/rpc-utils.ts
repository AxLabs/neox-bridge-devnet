import { type HexString, type InvokeResult, neonAdapter, RPCClient, Signer } from "./neon-adapter";
import { ContractInvocationError } from "../types";


export async function invokeMethod(rpcClient: RPCClient, contractHash: string, method: string, args?: unknown[]): Promise<InvokeResult> {
    const result = await rpcClient.invokeFunction(
        contractHash,
        method,
        args || []
    );

    validateInvocationResult(result, contractHash, method);
    return result;
}

function validateInvocationResult(result: InvokeResult, contract: string, method: string): void {
    if (result.state !== 'HALT') {
        throw new ContractInvocationError(
            `Failed to get ${method}: ${contract} execution failed`,
            result.exception || 'Unknown error'
        );
    }

    if (!result.stack || result.stack.length === 0) {
        throw new ContractInvocationError(`No result returned from ${contract}.${method} call`);
    }
}

export async function invokeScript(rpcClient: RPCClient, script: HexString, txSigners: Signer[]): Promise<InvokeResult> {
    const invokeResp = await rpcClient.invokeScript(
        neonAdapter.utils.HexString.fromHex(script),
        txSigners
    );
    if (invokeResp.state !== "HALT") {
        throw new ContractInvocationError(`Transaction script execution failed`, invokeResp.exception || 'Unknown error');
    }
    return invokeResp;
}
