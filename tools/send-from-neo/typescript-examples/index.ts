import { createAccountFromWalletFile, createDecryptedAccountFromWalletFile, createWalletFromFile } from "./wallet.js";
import { neonAdapter } from "./neon-adapter.js";
import { MessageBridge } from "./message-bridge.js";
import {
    MessageBridgeError,
    type Account,
    type MessageBridgeConfig,
    type SendExecutableMessageParams,
    type SendResultMessageParams,
    type SendStoreOnlyMessageParams
} from "./types.js";

const url = process.env.NEO_NODE_URL || "http://localhost:40332";

async function testWalletOperations() {
    console.log("=== Testing Wallet Operations ===");
    console.log("ESM Neon Adapter:", !!neonAdapter);

    const networkFacade = await neonAdapter.apiWrapper.NetworkFacade.fromConfig({
        node: url
    });

    console.log("Network Facade:", !!networkFacade);

    // Load wallet from environment variable
    const walletPath = process.env.WALLET_PATH;
    const walletPassword = process.env.WALLET_PASSWORD || "";

    if (walletPath) {
        try {
            console.log(`Loading wallet from: ${walletPath}`);

            // Create wallet using clean ESM adapter
            const walletInstance = createWalletFromFile(walletPath);
            console.log(`Wallet created - Name: ${walletInstance.name}`);
            console.log(`Number of accounts: ${walletInstance.accounts.length}`);

            // Example of using the adapter directly for other operations (if accounts exist)
            if (walletInstance.accounts.length > 0) {
                console.log(`Is valid address: ${neonAdapter.is.address(walletInstance.accounts[0].address)}`);
            }

            console.log(`password==${walletPassword}==`)
            if (walletPassword || walletPassword === "") {
                // Load and decrypt the default account
                const account = await createDecryptedAccountFromWalletFile(walletPath, walletPassword);
                if (account) {
                    console.log(`Decrypted account loaded - Address: ${account.address}`);
                    console.log(`Private key available: ${!!account.tryGet('WIF') ? account.WIF : 'no'}`);
                } else {
                    console.log('No accounts found in wallet file');
                }
            } else {
                // Load account without decrypting
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
        console.log('No WALLET_PATH environment variable set. Set it to load a wallet.');
        console.log('Example: WALLET_PATH=/path/to/wallet.json npm run dev');
    }
}

async function testMessageBridgeOperations() {
    console.log("\n=== Testing Message Bridge Operations ===");

    try {
        // Create MessageBridge instance using the factory function
        const messageBridge = await createMessageBridgeFromEnvironment();
        console.log(`Message Bridge Contract: ${messageBridge['config'].contractHash}`);
        console.log(`Sender Account: ${messageBridge['config'].account.address}`);
        console.log(`RPC URL: ${messageBridge['config'].rpcUrl}`);

        // Determine which operation to perform based on environment variables
        const operation = process.env.MESSAGE_OPERATION;

        switch (operation) {
            case 'executable':
                await performExecutableMessage(messageBridge);
                break;
            case 'result':
                await performResultMessage(messageBridge);
                break;
            case 'store-only':
                await performStoreOnlyMessage(messageBridge);
                break;
            default:
                console.log('No MESSAGE_OPERATION specified. Available operations:');
                console.log('- executable: Send an executable message');
                console.log('- result: Send a result message');
                console.log('- store-only: Send a store-only message');
                console.log('\nSet MESSAGE_OPERATION environment variable to run a specific operation.');
        }

    } catch (error) {
        console.error('Message Bridge operation failed:', error instanceof Error ? error.message : error);
    }
}

async function performExecutableMessage(messageBridge: MessageBridge) {
    const messageData = process.env.MESSAGE_EXECUTABLE_DATA;
    if (!messageData) {
        throw new Error('MESSAGE_EXECUTABLE_DATA environment variable is required for executable messages');
    }

    const storeResult = process.env.MESSAGE_STORE_RESULT === 'true';

    // Test reading the sending fee (like contract.sendingFee())
    const sendingFee = await messageBridge.sendingFee();
    console.log(`Current sending fee: ${sendingFee} (10^-8 GAS units)`);

    const params: SendExecutableMessageParams = {
        messageData,
        storeResult,
        sendingFee
    };

    // Call the method directly on the contract instance (ethers.js style)
    const result = await messageBridge.sendExecutableMessage(params);
    console.log('Executable message sent successfully:', result.txHash);
}

async function performResultMessage(messageBridge: MessageBridge) {
    const nonce = process.env.MESSAGE_NONCE;
    if (!nonce) {
        throw new Error('MESSAGE_NONCE environment variable is required for result messages');
    }

    const params: SendResultMessageParams = {
        nonce: parseInt(nonce, 10),
        sendingFee: 2000000 // Default fee value
    };

    // Call the method directly on the contract instance (ethers.js style)
    const result = await messageBridge.sendResultMessage(params);
    console.log('Result message sent successfully:', result.txHash);
}

async function performStoreOnlyMessage(messageBridge: MessageBridge) {
    const messageData = process.env.MESSAGE_STORE_ONLY_DATA;
    if (!messageData) {
        throw new Error('MESSAGE_STORE_ONLY_DATA environment variable is required for store-only messages');
    }

    const params: SendStoreOnlyMessageParams = {
        messageData,
        sendingFee: 2000000 // Default fee value
    };

    // Call the method directly on the contract instance (ethers.js style)
    const result = await messageBridge.sendStoreOnlyMessage(params);
    console.log('Store-only message sent successfully:', result.txHash);
}

async function main() {
    // First test basic wallet operations
    await testWalletOperations();

    // Then test message bridge operations if configuration is available
    const hasMessageBridgeConfig = process.env.MESSAGE_BRIDGE_CONTRACT_HASH && process.env.WALLET_PATH;
    if (hasMessageBridgeConfig) {
        await testMessageBridgeOperations();
    } else {
        console.log('\n=== Message Bridge Operations Skipped ===');
        console.log('To test message bridge operations, set these environment variables:');
        console.log('- MESSAGE_BRIDGE_CONTRACT_HASH: Contract hash of the message bridge');
        console.log('- WALLET_PATH: Path to wallet file');
        console.log('- WALLET_PASSWORD: Wallet password (optional)');
        console.log('- MESSAGE_OPERATION: Operation type (executable, result, store-only)');
        console.log('- MESSAGE_*_DATA: Message data for the specific operation');
        console.log('\nExample usage:');
        console.log('MESSAGE_BRIDGE_CONTRACT_HASH="0x123..." WALLET_PATH="./wallet.json" MESSAGE_OPERATION="executable" MESSAGE_EXECUTABLE_DATA="Hello World" npm run dev');
    }
}

/**
 * Create a MessageBridge instance from environment variables
 */
export async function createMessageBridgeFromEnvironment(): Promise<MessageBridge> {
    const contractHash = process.env.MESSAGE_BRIDGE_CONTRACT_HASH;
    if (!contractHash) {
        throw new MessageBridgeError('MESSAGE_BRIDGE_CONTRACT_HASH environment variable is required', 'MISSING_CONTRACT_HASH');
    }

    const walletPath = process.env.WALLET_PATH;
    if (!walletPath) {
        throw new MessageBridgeError('WALLET_PATH environment variable is required', 'MISSING_WALLET_PATH');
    }

    const walletPassword = process.env.WALLET_PASSWORD || '';
    const rpcUrl = process.env.N3_RPC_URL || 'http://localhost:40332';

    // Load account - always try to decrypt if password is available
    let account: Account | null;
    if (walletPassword || walletPassword === "") {
        account = await createDecryptedAccountFromWalletFile(walletPath, walletPassword);
    } else {
        // Try to load without password first
        account = createAccountFromWalletFile(walletPath);

        // Check if the account has an encrypted private key
        if (account && account.tryGet("encrypted")) {
            throw new MessageBridgeError(
                'Wallet contains encrypted private key but no WALLET_PASSWORD environment variable provided. Please set WALLET_PASSWORD to decrypt the wallet.',
                'ENCRYPTED_WALLET_NO_PASSWORD'
            );
        }
    }

    if (!account) {
        throw new MessageBridgeError('Failed to load account from wallet file', 'ACCOUNT_LOAD_FAILED');
    }

    const config: MessageBridgeConfig = {
        contractHash,
        rpcUrl,
        account
    };

    return new MessageBridge(config);
}

// --- AUTO-TEST: MessageBridge executable message (match Java example) ---
(async () => {
    process.env.MESSAGE_BRIDGE_CONTRACT_HASH = "bd98300a1951d72533fa749010265f71c4cfff38";
    process.env.NEO_NODE_URL = "http://seed3t5.neo.org:40332";
    process.env.MESSAGE_OPERATION = "executable";
    process.env.MESSAGE_EXECUTABLE_DATA = "0x000000000000000000000000000000000000000000000000000000000000002000000000000000000000000005fd43b3efcb4ff1ca08229caecf67bc21d0c0a3000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000000000002470a08231000000000000000000000000b156115f737be58a9115febe08dc474c8117aebd00000000000000000000000000000000000000000000000000000000";
    process.env.MESSAGE_STORE_RESULT = "true";
    // You must set WALLET_PATH and WALLET_PASSWORD in your environment or here if you want to automate fully
    process.env.WALLET_PATH = "personal.json";
    // process.env.WALLET_PASSWORD = "yourpassword";
    await main();
})();
