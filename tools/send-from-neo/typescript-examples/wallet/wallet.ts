import { readFileSync } from "fs";
import { type Account, neonAdapter, type Wallet, type WalletJSON } from "../neo/neon-adapter";

/**
 * Creates a Wallet from a Neo3 wallet JSON file using the ESM-normalized neon adapter
 * @param walletPath - Path to the Neo3 wallet JSON file
 * @returns Wallet instance
 */
export function createWalletFromFile(walletPath: string): Wallet {
    try {
        const walletData = readFileSync(walletPath, 'utf-8');
        const walletJson = JSON.parse(walletData) as WalletJSON;

        // Use the normalized ESM adapter
        return neonAdapter.create.wallet(walletJson);
    } catch (error) {
        throw new Error(`Failed to load wallet from ${walletPath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Creates an Account from a Neo3 wallet JSON file (gets the default account)
 * @param walletPath - Path to the Neo3 wallet JSON file
 * @returns Account instance
 * @throws Error if no accounts found in wallet or if wallet loading fails
 */
export function createAccountFromWalletFile(walletPath: string): Account {
    let walletInstance: Wallet;

    try {
        walletInstance = createWalletFromFile(walletPath);
    } catch (error) {
        throw new Error(`Failed to load account from ${walletPath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Validate wallet has accounts (outside try-catch to avoid local control flow)
    if (!walletInstance.accounts || walletInstance.accounts.length === 0) {
        throw new Error(`No accounts found in wallet file ${walletPath}`);
    }

    // Get the default account or first account
    const account = walletInstance.accounts.find((acc: Account) => acc.isDefault) || walletInstance.accounts[0];

    if (!account) {
        throw new Error(`No valid accounts found in wallet file ${walletPath}`);
    }

    return account;
}

/**
 * Creates an Account from a wallet file and decrypts it with the provided password
 * @param walletPath - Path to the Neo3 wallet JSON file
 * @param password - Password to decrypt the wallet
 * @returns Promise that resolves to decrypted Account instance
 * @throws Error if wallet loading fails or no accounts found in wallet
 */
export async function createDecryptedAccountFromWalletFile(walletPath: string, password: string): Promise<Account | null> {
    return createAccountFromWalletFile(walletPath).decrypt(password);
}
