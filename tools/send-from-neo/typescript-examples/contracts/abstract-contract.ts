import { ContractParam, neonAdapter, type StackItemJson } from "../neo/neon-adapter";
import { type ContractWrapperConfig, InvalidParameterError } from "../types";
import { invokeMethod } from "../neo/rpc-utils";

// Define types for stack item values and decoded results
type StackItemValue = string | number | boolean | null | StackItemJson[];
type DecodedStackItem =
    string
    | number
    | boolean
    | null
    | StackItemJson
    | DecodedStackItem[];

export abstract class AbstractContract {
    protected readonly rpcClient;
    protected readonly config: ContractWrapperConfig;

    protected constructor(config: ContractWrapperConfig) {
        this.config = config;
        this.rpcClient = neonAdapter.create.rpcClient(config.rpcUrl);
    }

    public getConfig(): ContractWrapperConfig {
        return this.config;
    }

    // region value translators
    protected async getBooleanValue(methodName: string, params?: ContractParam[]): Promise<boolean> {
        return Boolean(await this.getStackValue(methodName, params));
    }

    protected async getNumberValue(methodName: string, params?: ContractParam[]): Promise<number> {
        return Number(await this.getStackValue(methodName, params));
    }

    protected async getStringValue(methodName: string, params?: ContractParam[]): Promise<string> {
        const result = await this.getStackValue(methodName, params);

        if (typeof result === 'string') {
            let hexString = neonAdapter.utils.base642hex(result);
            return neonAdapter.utils.hexstring2str(hexString);
        } else {
            return String(result);
        }
    }

    protected async getHexValue(methodName: string, params?: ContractParam[]): Promise<string> {
        const result = await this.getStackValue(methodName, params);

        if (typeof result === 'string') {
            return `0x${neonAdapter.utils.base642hex(result)}`;
        } else {
            return String(result);
        }
    }

    protected async getObjectValue(methodName: string, params?: ContractParam[]): Promise<DecodedStackItem> {
        const result = await this.getStackValue(methodName, params);

        if (Array.isArray(result)) {
            return result.map(item => this.decodeStackItem(item, methodName));
        }

        return this.decodeStackItem(result, methodName);
    }

    protected decodeStackItem(item: StackItemValue | StackItemJson, methodName?: string): DecodedStackItem {
        if (Array.isArray(item)) {
            return item.map(nestedItem => this.decodeStackItem(nestedItem, methodName));
        }

        if (item && typeof item === 'object' && 'type' in item && 'value' in item) {
            const {type, value} = item;

            switch (type) {
                case 'Array':
                    if (Array.isArray(value)) {
                        return value.map(nestedItem => this.decodeStackItem(nestedItem, methodName));
                    }
                    return value as DecodedStackItem;
                case 'ByteString':
                case 'Buffer':
                case 'Pointer':
                    if (typeof value === 'string') {
                        try {
                            return `0x${neonAdapter.utils.base642hex(value)}`;
                        } catch {
                            return value;
                        }
                    }
                    return value as DecodedStackItem;
                case 'Integer':
                    return Number(value);
                case 'Boolean':
                    return Boolean(value);
                default:
                    return value as DecodedStackItem;
            }
        }

        return item as DecodedStackItem;
    }

    protected async getStackValue(methodName: string, params: ContractParam[] = []): Promise<StackItemValue> {
        let errorMessage = `Invalid ${methodName} value returned from contract`;
        return await invokeMethod(this.rpcClient, this.config.contractHash, methodName, errorMessage, params);
    }

    // endregion

    // region parameter validators
    protected validateUint(uint: number, context: string): void {
        if (uint === undefined || uint === null) {
            throw new InvalidParameterError(`uint for ${context}`, `defined number value`);
        }
        if (!Number.isInteger(uint)) {
            throw new InvalidParameterError(`uint for ${context}`, `integer value, got ${typeof uint}: ${uint}`);
        }
        if (uint < 0) {
            throw new InvalidParameterError(`uint for ${context}`, `non-negative integer, got ${uint}`);
        }
    }

    protected validateScriptHash(hash: string, context: string): void {
        const cleanHash = hash.startsWith('0x') ? hash.slice(2) : hash;
        if (!/^[0-9a-fA-F]{40}$/.test(cleanHash)) {
            throw new InvalidParameterError(`target hash for ${context}`, `40-character hex string, got ${hash}`);
        }
    }

    protected validateCallFlags(callFlags: number, context: string): void {
        if (!Number.isInteger(callFlags)) {
            throw new InvalidParameterError(`call flags for ${context}`, `integer value, got ${typeof callFlags}: ${callFlags}`);
        }
        if (callFlags < 0 || callFlags > 255) {
            throw new InvalidParameterError(`call flags for ${context}`, `value between 0 and 255, got ${callFlags}`);
        }
    }

    // endregion
}
