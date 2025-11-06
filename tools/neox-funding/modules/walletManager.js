import { ethers } from 'ethers';
import path from 'path';
import { readText } from './utils/fileUtils.js';
import { normalize } from './utils/addressUtils.js';

// Configuration paths
const NODE1_BASE_DIR = "../../go-ethereum/privnet/single/node1/";
const KEYSTORE_PATH = path.join(process.cwd(), NODE1_BASE_DIR, "keystore/UTC--2023-12-25T15-29-12.815843682Z--74f4effb0b538baec703346b03b6d9292f53a4cd");
const KEYSTORE_PASSWORD_FILE = path.join(process.cwd(), NODE1_BASE_DIR, "password.txt");
const NEOX_WALLETS_DIR = path.join(process.cwd(), "neox-wallets");

/**
 * Wallet management service
 */
class WalletManagerService {
  static getKeystorePassword() {
    console.log(`Reading keystore password from: ${KEYSTORE_PASSWORD_FILE}`);
    return readText(KEYSTORE_PASSWORD_FILE, 'keystore password');
  }

  static loadFromKeystore(keystorePath = KEYSTORE_PATH, password = null, provider = null) {
    const keystorePassword = password !== null ? password : this.getKeystorePassword();
    console.log(`Loading keystore from: ${keystorePath}`);

    try {
      const keystoreJson = readText(keystorePath, 'keystore');
      const wallet = ethers.Wallet.fromEncryptedJsonSync(keystoreJson, keystorePassword);
      return provider ? wallet.connect(provider) : wallet;
    } catch (error) {
      console.error(`Error loading keystore from ${keystorePath}:`, error.message);
      throw error;
    }
  }

  static loadNamedWallet(walletName, provider = null) {
    const walletPath = path.join(NEOX_WALLETS_DIR, `${walletName}.json`);
    return this.loadFromKeystore(walletPath, "", provider); // Empty password for wallet files
  }

  static async validateWallet(wallet, expectedAddress = null) {
    if (expectedAddress) {
      const normalizedExpected = normalize(expectedAddress);
      const normalizedActual = normalize(wallet.address);

      if (normalizedActual !== normalizedExpected) {
        throw new Error(`Address mismatch: expected ${normalizedExpected}, got ${normalizedActual}`);
      }
    }

    if (wallet.provider) {
      const balance = await wallet.provider.getBalance(wallet.address);
      console.log(`   Wallet ${wallet.address} balance: ${ethers.formatEther(balance)} ETH`);
      return balance;
    }

    return null;
  }
}

// Export only the methods needed by other modules
export const loadFromKeystore = WalletManagerService.loadFromKeystore.bind(WalletManagerService);
export const loadNamedWallet = WalletManagerService.loadNamedWallet.bind(WalletManagerService);
export const validateWallet = WalletManagerService.validateWallet.bind(WalletManagerService);
