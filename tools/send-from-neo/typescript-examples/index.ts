import {
    createAccountFromWalletFile,
    createDecryptedAccountFromWalletFile,
    createWalletFromFile
} from "./wallet/wallet";
import { neonAdapter } from "./neo/neon-adapter";
import { MessageBridge } from "./contracts/message-bridge";
import {
    type Account,
    type ContractWrapperConfig,
    GenericError,
    type SendExecutableMessageParams,
    type SendResultMessageParams,
    type SendStoreOnlyMessageParams
} from "./types";

const url = process.env.NEO_NODE_URL || "http://localhost:40332";

// region Test Functions
async function testWalletOperations() {
    console.log("=== Testing Wallet Operations ===");

    const networkFacade = await neonAdapter.apiWrapper.NetworkFacade.fromConfig({
        node: url
    });

    console.log("Network Facade:", !!networkFacade);

    const walletPath = process.env.WALLET_PATH;
    const walletPassword = process.env.WALLET_PASSWORD || "";

    if (walletPath) {
        try {
            console.log(`Loading wallet from: ${walletPath}`);

            const walletInstance = createWalletFromFile(walletPath);
            console.log(`Wallet created - Name: ${walletInstance.name}`);
            console.log(`Number of accounts: ${walletInstance.accounts.length}`);

            if (walletInstance.accounts.length > 0) {
                console.log(`Is valid address: ${neonAdapter.is.address(walletInstance.accounts[0].address)}`);
            }

            if (walletPassword || walletPassword === "") {
                const account = await createDecryptedAccountFromWalletFile(walletPath, walletPassword);
                if (account) {
                    console.log(`Decrypted account loaded - Address: ${account.address}`);
                    console.log(`Private key available: ${!!account.tryGet('WIF') ? account.WIF : 'no'}`);
                } else {
                    console.log('No accounts found in wallet file');
                }
            } else {
                const account = createAccountFromWalletFile(walletPath);
                if (account) {
                    console.log(`Account loaded - Address: ${account.address}`);
                    console.log(`Account is encrypted: ${!!account.tryGet('encrypted')}`);
                } else {
                    console.log('No accounts found in wallet file');
                }
            }
        } catch (error) {
            console.error('Error loading wallet:', error instanceof Error ? error.message : error);
        }
    } else {
        console.error('No WALLET_PATH environment variable set. Set it to load a wallet.');
        console.error('Example: WALLET_PATH=/path/to/wallet.json npm run dev');
    }
}

async function testMessageBridgeOperations() {
    console.log("\n=== Testing Message Bridge Operations ===");

    try {
        const messageBridge = await createMessageBridgeFromEnvironment();

        // Test read-only methods first
        await testReadOnlyMethods(messageBridge);

        const operation = process.env.MESSAGE_BRIDGE_OPERATION;

        switch (operation) {
            case 'send-executable':
                await sendExecutableMessage(messageBridge);
                break;
            case 'send-result':
                await sendResultMessage(messageBridge);
                break;
            case 'send-store-only':
                await sendStoreOnlyMessage(messageBridge);
                break;
            case 'serialize-is-paused':
                await serializeIsPausedCall(messageBridge);
                break;
            case 'execute-message':
                await executeMessage(messageBridge);
                break;
            case 'pause-all-test':
                await testAllPauseOperations(messageBridge);
                break;
            case 'none':
                console.log('No-op selected. Exiting.');
                break;
            default:
                console.log('No MESSAGE_OPERATION specified. Available operations:');
                console.log('- executable: Send an executable message');
                console.log('- result: Send a result message');
                console.log('- store-only: Send a store-only message');
                console.log('- serialize-is-paused: Serialize a call to the isPaused method');
                console.log('- execute-message: Execute a message by nonce');
                console.log('- pause-test: Test pause/unpause entire contract with state checks');
                console.log('- pause-sending-test: Test pause/unpause sending operations with state checks');
                console.log('- pause-executing-test: Test pause/unpause executing operations with state checks');
                console.log('- pause-all-test: Test all pause/unpause operations with comprehensive state checks');
                console.log('\nSet MESSAGE_OPERATION environment variable to run a specific operation.');
        }

    } catch (error) {
        console.error('Message Bridge operation failed:', error instanceof Error ? error.message : error);
    }
}

async function testReadOnlyMethods(messageBridge: MessageBridge) {
    console.log("\n--- Testing Read-Only Methods ---");

    try {
        const version = await messageBridge.version();
        console.log(`Contract Version: ${version}`);

        const sendingFee = await messageBridge.sendingFee();
        console.log(`Sending Fee: ${sendingFee} (10^-8 GAS units)`);

        const managementAddress = await messageBridge.management();
        console.log(`Management Contract Address: ${managementAddress}`);

        const unclaimedFees = await messageBridge.unclaimedFees();
        console.log(`Unclaimed Fees: ${unclaimedFees} (10^-8 GAS units)`);

        const linkedChainId = await messageBridge.linkedChainId();
        console.log(`Linked Chain ID: ${linkedChainId}`);

        const executionManagerAddress = await messageBridge.executionManager();
        console.log(`Execution Manager Address: ${executionManagerAddress}`);

        const neoToEvmNonce = await messageBridge.neoToEvmNonce();
        console.log(`Neo to EVM Nonce: ${neoToEvmNonce}`);

        const evmToNeoNonce = await messageBridge.evmToNeoNonce();
        console.log(`EVM to Neo Nonce: ${evmToNeoNonce}`);

        const neoToEvmRoot = await messageBridge.neoToEvmRoot();
        console.log(`Neo to EVM Root: ${neoToEvmRoot}`);

        const evmToNeoRoot = await messageBridge.evmToNeoRoot();
        console.log(`EVM to Neo Root: ${evmToNeoRoot}`);

        const messageBridgeInfo = await messageBridge.getMessageBridge();
        console.log(`Message Bridge Info:`);
        console.log(`  EVM to Neo State:`, messageBridgeInfo.evmToNeoState);
        console.log(`  Neo to EVM State:`, messageBridgeInfo.neoToEvmState);
        console.log(`  Config:`, messageBridgeInfo.config);

        // Test methods that require parameters with example values
        const testNonce = process.env.MESSAGE_NONCE ? Number(process.env.MESSAGE_NONCE) : 1;

        try {
            const message = await messageBridge.getMessage(testNonce);
            console.log(`Message (nonce ${testNonce}):`);
            console.log(`  Metadata Bytes: ${message.metadataBytes}`);
            console.log(`  Raw Message: ${message.rawMessage}`);
        } catch (error) {
            console.log(`getMessage(${testNonce}): No message found or error - ${error instanceof Error ? error.message : error}`);
        }

        try {
            const metadata = await messageBridge.getMetadata(testNonce);
            console.log(`Metadata (nonce ${testNonce}):`);
            console.log(`  Type: ${metadata.type} (${metadata.type === 0 ? 'EXECUTABLE' : metadata.type === 1 ? 'STORE_ONLY' : 'RESULT'})`);
            console.log(`  Timestamp: ${metadata.timestamp}`);
            console.log(`  Sender: ${metadata.sender}`);

            // Type-specific fields
            if (metadata.type === 0) {
                console.log(`  Store Result: ${metadata.storeResult}`);
            } else if (metadata.type === 2) {
                console.log(`  Initial Message Nonce: ${metadata.initialMessageNonce}`);
            }
        } catch (error) {
            console.log(`getMetadata(${testNonce}): No metadata found or error - ${error instanceof Error ? error.message : error}`);
        }

        try {
            const executableState = await messageBridge.getExecutableState(testNonce);
            console.log(`Executable State (nonce ${testNonce}):`);
            console.log(`  Executed: ${executableState.executed}`);
            console.log(`  Expiration Time: ${executableState.expirationTime}`);
        } catch (error) {
            console.log(`getExecutableState(${testNonce}): No state found or error - ${error instanceof Error ? error.message : error}`);
        }

        try {
            const evmExecutionResult = await messageBridge.getEvmExecutionResult(Number(process.env.MESSAGE_NONCE));
            console.log(`EVM Execution Result (nonce 1): ${evmExecutionResult}`);
        } catch (error) {
            console.log(`getEvmExecutionResult: No result found or error - ${error instanceof Error ? error.message : error}`);
        }

        try {
            const neoExecutionResult = await messageBridge.getNeoExecutionResult(Number(process.env.MESSAGE_NONCE));
            console.log(`Neo Execution Result (nonce 1): ${neoExecutionResult}`);
        } catch (error) {
            console.log(`getNeoExecutionResult: No result found or error - ${error instanceof Error ? error.message : error}`);
        }

    } catch (error) {
        console.error('Failed to call read-only methods:', error instanceof Error ? error.message : error);
    }
}

async function sendExecutableMessage(messageBridge: MessageBridge) {
    const messageData = process.env.MESSAGE_EXECUTABLE_DATA;
    if (!messageData) {
        throw new Error('MESSAGE_EXECUTABLE_DATA environment variable is required for executable messages');
    }

    const storeResult = process.env.MESSAGE_STORE_RESULT === 'true';

    const sendingFee = await messageBridge.sendingFee();

    const params: SendExecutableMessageParams = {
        messageData,
        storeResult,
        sendingFee
    };

    const result = await messageBridge.sendExecutableMessage(params);
    console.log('Executable message sent successfully:', result.txHash);
}

async function sendResultMessage(messageBridge: MessageBridge) {
    const nonce = process.env.MESSAGE_NONCE;
    if (!nonce) {
        throw new Error('MESSAGE_NONCE environment variable is required for result messages');
    }

    const sendingFee = await messageBridge.sendingFee();

    const params: SendResultMessageParams = {
        nonce: parseInt(nonce, 10),
        sendingFee: sendingFee
    };

    const result = await messageBridge.sendResultMessage(params);
    console.log('Result message sent successfully:', result.txHash);
}

async function sendStoreOnlyMessage(messageBridge: MessageBridge) {
    const messageData = process.env.MESSAGE_STORE_ONLY_DATA;
    if (!messageData) {
        throw new GenericError('MESSAGE_STORE_ONLY_DATA environment variable is required for store-only messages');
    }

    const sendingFee = await messageBridge.sendingFee();

    const params: SendStoreOnlyMessageParams = {
        messageData,
        sendingFee: sendingFee
    };

    const result = await messageBridge.sendStoreOnlyMessage(params);
    console.log('Store-only message sent successfully:', result.txHash);
}

async function serializeIsPausedCall(messageBridge: MessageBridge) {
    try {
        const contractHash = process.env.MESSAGE_BRIDGE_CONTRACT_HASH || "";

        // Serialize a call to the isPaused method (no parameters)
        const serializedCall = await messageBridge.serializeCall(
            contractHash,
            'isPaused',
            0, // CallFlags.None
            [] // No parameters
        );

        console.log('Serialized isPaused call:');
        console.log(serializedCall);
    } catch (error) {
        console.error('Failed to serialize isPaused call:', error instanceof Error ? error.message : error);
    }
}

async function executeMessage(messageBridge: MessageBridge) {
    const nonce = process.env.MESSAGE_NONCE;
    if (!nonce) {
        throw new Error('MESSAGE_NONCE environment variable is required for executing messages');
    }

    const nonceValue = parseInt(nonce, 10);
    if (isNaN(nonceValue)) {
        throw new Error('MESSAGE_NONCE must be a valid integer');
    }

    try {
        console.log(`Executing message with nonce: ${nonceValue}`);

        const result = await messageBridge.executeMessage(nonceValue);
        console.log('Message executed successfully:', result.txHash);
        // Wait for state update
        await waitForStateUpdate();
        // Get and log the execution result
        const executionResult = await messageBridge.getEvmExecutionResult(nonceValue);
        console.log(`Execution result for nonce ${nonceValue}:`, executionResult);
    } catch (error: any) {
        console.error('Failed to execute message:', error instanceof Error ? error.message : error);
    }
}

// endregion

// region Main Execution
async function main() {
    // uncomment to test wallet operations
    // await testWalletOperations();

    await testMessageBridgeOperations();

}

// endregion

// region Helper Functions
export async function createMessageBridgeFromEnvironment(): Promise<MessageBridge> {
    const contractHash = process.env.MESSAGE_BRIDGE_CONTRACT_HASH;
    if (!contractHash) {
        throw new GenericError('MESSAGE_BRIDGE_CONTRACT_HASH environment variable is required', 'MISSING_CONTRACT_HASH');
    }

    const walletPath = process.env.WALLET_PATH;
    if (!walletPath) {
        throw new GenericError('WALLET_PATH environment variable is required', 'MISSING_WALLET_PATH');
    }

    const walletPassword = process.env.WALLET_PASSWORD || '';
    const rpcUrl = process.env.N3_RPC_URL || 'http://localhost:40332';

    let account: Account | null;
    if (walletPassword || walletPassword === "") {
        account = await createDecryptedAccountFromWalletFile(walletPath, walletPassword);
    } else {
        account = createAccountFromWalletFile(walletPath);

        if (account && account.tryGet("encrypted")) {
            throw new GenericError(
                'Wallet contains encrypted private key but no WALLET_PASSWORD environment variable provided. Please set WALLET_PASSWORD to decrypt the wallet.',
                'ENCRYPTED_WALLET_NO_PASSWORD'
            );
        }
    }

    if (!account) {
        throw new GenericError('Failed to load account from wallet file', 'ACCOUNT_LOAD_FAILED');
    }

    const config: ContractWrapperConfig = {
        contractHash,
        rpcUrl,
        account
    };

    return new MessageBridge(config);
}

async function waitForStateUpdate(waitMs: number = 1000): Promise<void> {
    console.log(`  Waiting ${waitMs}ms for state update...`);
    return new Promise(resolve => setTimeout(resolve, waitMs));
}

async function testAllPauseOperations(messageBridge: MessageBridge) {
    console.log("\n--- Testing All Pause/Unpause Operations ---");

    // Get block time estimate if available from the rpcClient
    const version = await messageBridge.rpcClient.getVersion();
    const waitInterval = version.protocol.msperblock;

    try {
        // Check initial state
        console.log("\n1. Initial State Check:");
        let pausedStates = await logPauseStates(messageBridge);

        // Test general pause
        console.log("\n2. Testing general pause/unpause...");
        if (pausedStates && !pausedStates.isPaused) {
            const generalPauseResult = await messageBridge.pause();
            console.log(`General pause transaction: ${generalPauseResult.txHash}`);
            await waitForStateUpdate(waitInterval);
            pausedStates = await logPauseStates(messageBridge);
        }

        if (pausedStates && pausedStates.isPaused) {
            const generalUnpauseResult = await messageBridge.unpause();
            console.log(`General unpause transaction: ${generalUnpauseResult.txHash}`);
            await waitForStateUpdate(waitInterval);
            pausedStates = await logPauseStates(messageBridge);
        }

        // Test sending pause
        if (pausedStates && !pausedStates.sendingIsPaused) {
            console.log("\n3. Testing sending pause/unpause...");
            const sendingPauseResult = await messageBridge.pauseSending();
            console.log(`Sending pause transaction: ${sendingPauseResult.txHash}`);
            await waitForStateUpdate(waitInterval);
            await logPauseStates(messageBridge);
        }

        if (pausedStates && pausedStates.sendingIsPaused) {
            const sendingUnpauseResult = await messageBridge.unpauseSending();
            console.log(`Sending unpause transaction: ${sendingUnpauseResult.txHash}`);
            await waitForStateUpdate(waitInterval);
            pausedStates = await logPauseStates(messageBridge);
        }

        // Test executing pause
        if (pausedStates && !pausedStates.executingIsPaused) {
            console.log("\n4. Testing executing pause/unpause...");
            const executingPauseResult = await messageBridge.pauseExecuting();
            console.log(`Executing pause transaction: ${executingPauseResult.txHash}`);
            await waitForStateUpdate(waitInterval);
            pausedStates = await logPauseStates(messageBridge);
        }

        if (pausedStates && pausedStates.executingIsPaused) {
            const executingUnpauseResult = await messageBridge.unpauseExecuting();
            console.log(`Executing unpause transaction: ${executingUnpauseResult.txHash}`);
            await waitForStateUpdate(waitInterval);

            await logPauseStates(messageBridge);
        }


        console.log("\n5. Final State Check:");
        await logPauseStates(messageBridge);

    } catch (error) {
        console.error('All pause operations test failed:', error instanceof Error ? error.message : error);
    }
}

async function logPauseStates(messageBridge: MessageBridge) {
    try {
        const isPaused = await messageBridge.isPaused();
        const sendingIsPaused = await messageBridge.sendingIsPaused();
        const executingIsPaused = await messageBridge.executingIsPaused();

        console.log(`  General Paused: ${isPaused}`);
        console.log(`  Sending Paused: ${sendingIsPaused}`);
        console.log(`  Executing Paused: ${executingIsPaused}`);
        return {isPaused, sendingIsPaused, executingIsPaused};
    } catch (error) {
        console.error('  Failed to get pause states:', error instanceof Error ? error.message : error);
    }
}

// endregion

// --- AUTO-TEST: MessageBridge executable message (match Java example) ---
(async () => {
    process.env.MESSAGE_BRIDGE_CONTRACT_HASH = "bd98300a1951d72533fa749010265f71c4cfff38";
    process.env.NEO_NODE_URL = "http://seed3t5.neo.org:40332";
    // process.env.MESSAGE_BRIDGE_OPERATION = "send-executable";
    // process.env.MESSAGE_EXECUTABLE_DATA = "0x000000000000000000000000000000000000000000000000000000000000002000000000000000000000000005fd43b3efcb4ff1ca08229caecf67bc21d0c0a3000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000000000002470a08231000000000000000000000000b156115f737be58a9115febe08dc474c8117aebd00000000000000000000000000000000000000000000000000000000";
    // process.env.MESSAGE_STORE_RESULT = "true";
    // process.env.MESSAGE_BRIDGE_OPERATION = "send-store-only";
    // process.env.MESSAGE_STORE_ONLY_DATA = "0xaaaaaaaaaa";
    process.env.MESSAGE_NONCE = "1";
    process.env.MESSAGE_BRIDGE_OPERATION = "none";
    process.env.WALLET_PATH = "../../neon3-funding/neon3-wallets/governor.json";
    await main();
})();
