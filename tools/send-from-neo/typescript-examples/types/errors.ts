/**
 * @fileoverview Custom error types for Message Bridge operations
 */

export class RpcQueryError extends Error {
    public code?: string;

    constructor(message: string, readonly method: string) {
        super(message);
        this.name = 'RpcQueryError';
        this.code = method;
    }
}

export class GenericError extends Error {
    constructor(message: string, readonly code?: string) {
        super(message);
        this.code = code;
    }
}

export class ContractInvocationError extends GenericError {
    private static CODE = 'CONTRACT_INVOCATION_FAILED';

    constructor(message: string, public readonly exception?: string | null) {
        super(message, ContractInvocationError.CODE);
        this.name = 'ContractInvocationError';
    }
}

export class InsufficientFundsError extends GenericError {
    private static CODE = 'INSUFFICIENT_FUNDS';

    constructor(message: string, public readonly required: string, public readonly available: string) {
        super(message, InsufficientFundsError.CODE);
        this.name = 'InsufficientFundsError';
    }
}

export class InvalidParameterError extends GenericError {
    private static CODE = 'INVALID_PARAMETER';

    constructor(public readonly parameterName: string, public readonly expectedType?: string) {
        let message = `${parameterName} must be provided ${expectedType ? `as ${expectedType}` : ''}.`;
        super(message, InvalidParameterError.CODE);
        this.name = 'InvalidParameterError';
    }
}
