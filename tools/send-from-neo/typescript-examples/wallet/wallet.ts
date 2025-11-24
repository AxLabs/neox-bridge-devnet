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
 * @returns Account instance or null if no accounts found
 */
export function createAccountFromWalletFile(walletPath: string): Account {
    try {
        const walletInstance = createWalletFromFile(walletPath);

        // Get the default account or first account
        return walletInstance.accounts.find((acc: Account) => acc.isDefault) || walletInstance.accounts[0];
    } catch (error) {
        throw new Error(`Failed to load account from ${walletPath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Creates an Account from a wallet file and decrypts it with the provided password
 * @param walletPath - Path to the Neo3 wallet JSON file
 * @param password - Password to decrypt the wallet
 * @returns Decrypted Account instance or null if no accounts found
 */
export async function createDecryptedAccountFromWalletFile(walletPath: string, password: string): Promise<Account | null> {
    return createAccountFromWalletFile(walletPath).decrypt(password);
}
