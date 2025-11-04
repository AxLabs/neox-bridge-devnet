import { ethers } from 'ethers';
import { GAS_CONFIG, sendTransaction, waitAndVerify, sendAndWait } from './transactionUtils.js';
import { loadFromKeystore, loadNamedWallet, validateWallet } from './walletManager.js';

/**
 * Account funding service
 */
class AccountFunderService {
  static async setupProvider(rpcUrl) {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    console.log(`Connecting to: ${rpcUrl}`);
    return provider;
  }

  static async setupAndValidateWallet(provider, keystorePath, expectedAddress) {
    console.log("\nLoading sender account...");
    const wallet = loadFromKeystore(keystorePath, null, provider);
    console.log(`   Sender address: ${wallet.address}`);

    await validateWallet(wallet, expectedAddress);
    return wallet;
  }

  static validateFundingData(allData) {
    if (allData.length === 0) {
      console.error("No valid funding data found from CSV or wallet files");
      process.exit(1);
    }
  }

  static calculateRequirements(allData) {
    let totalAmount = 0n;

    for (const entry of allData) {
      const sourceInfo = entry.source === 'CSV' ? '[from CSV]' : `[from ${entry.source}]`;
      console.log(`   ${entry.address}: ${ethers.formatEther(entry.amountWei)} ETH ${sourceInfo}`);
      totalAmount += entry.amountWei;
    }

    const estimatedGasCost = BigInt(allData.length) * BigInt(GAS_CONFIG.limit) * ethers.parseUnits(GAS_CONFIG.maxFeePerGas.toString(), "gwei");

    return { totalAmount, estimatedGasCost };
  }

  static validateSufficientBalance(senderBalance, totalAmount, estimatedGasCost) {
    console.log(`\nTotal amount to transfer: ${ethers.formatEther(totalAmount)} ETH`);
    console.log(`Estimated gas cost: ${ethers.formatEther(estimatedGasCost)} ETH`);
    console.log(`Total needed: ${ethers.formatEther(totalAmount + estimatedGasCost)} ETH`);

    if (senderBalance < totalAmount + estimatedGasCost) {
      console.error(`Insufficient balance. Need ${ethers.formatEther(totalAmount + estimatedGasCost)} ETH, have ${ethers.formatEther(senderBalance)} ETH`);
      process.exit(1);
    }

    console.log("Sufficient balance available");
  }

  static async sendFundingTransactions(provider, wallet, allData) {
    console.log("\nPhase 1: Checking balances and sending transactions...");

    const pendingTransactions = [];
    let skippedTransfers = 0;
    let failedToSend = 0;

    for (let i = 0; i < allData.length; i++) {
      const entry = allData[i];
      const sourceInfo = entry.source === 'CSV' ? '[from CSV]' : `[from ${entry.source}]`;
      console.log(`\n[${i + 1}/${allData.length}] Processing ${entry.address}${sourceInfo}...`);

      // Check if already sufficiently funded
      try {
        const currentBalance = await provider.getBalance(entry.address);
        if (currentBalance >= entry.amountWei) {
          console.log(`   Skipping: Address already has ${ethers.formatEther(currentBalance)} ETH (required: ${ethers.formatEther(entry.amountWei)} ETH)`);
          skippedTransfers++;
          continue;
        }
      } catch (err) {
        console.error(`   Error fetching balance for ${entry.address}:`, err.message);
        failedToSend++;
        continue;
      }

      // Send transaction
      const result = await sendTransaction(wallet, {
        to: entry.address,
        value: entry.amountWei
      });

      if (result.success) {
        pendingTransactions.push({
          txHash: result.txHash,
          address: entry.address,
          amount: entry.amountWei,
          sourceInfo,
          index: i + 1
        });
      } else {
        failedToSend++;
      }

      // Small delay between transactions
      if (i < allData.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    console.log(`\nPhase 1 Summary:`);
    console.log(`   Transactions sent: ${pendingTransactions.length}`);
    console.log(`   Addresses skipped (already funded): ${skippedTransfers}`);
    console.log(`   Failed to send: ${failedToSend}`);

    return { pendingTransactions, skippedTransfers, failedToSend };
  }

  static async verifyTransactions(provider, pendingTransactions) {
    console.log("\nPhase 2: Verifying transaction confirmations...");
    let successfulTransfers = 0;
    let failedTransfers = 0;

    for (let i = 0; i < pendingTransactions.length; i++) {
      const pending = pendingTransactions[i];
      console.log(`\n[${i + 1}/${pendingTransactions.length}] Verifying ${pending.address}${pending.sourceInfo} (tx: ${pending.txHash})...`);

      const result = await waitAndVerify(provider, pending.txHash, pending.address);
      if (result.success) {
        successfulTransfers++;
      } else {
        failedTransfers++;
      }
    }

    return { successfulTransfers, failedTransfers };
  }

  static async sendRelayerTransaction(provider) {
    console.log("\nSending small transaction from relayer wallet to itself to increase nonce...");

    try {
      const relayerWallet = loadNamedWallet("relayer", provider);

      const result = await sendAndWait(relayerWallet, {
        to: relayerWallet.address,
        value: ethers.parseEther("0.0001")
      });

      if (result.success) {
        const relayerNonce = await provider.getTransactionCount(relayerWallet.address);
        console.log(`   Relayer wallet nonce after transaction: ${relayerNonce}`);
      } else {
        console.error("Failed to send relayer transaction:", result.error);
      }
    } catch (error) {
      console.error("Failed to load relayer wallet:", error.message);
    }
  }
}

// Export only the functions needed by the main module
export const setupProvider = AccountFunderService.setupProvider.bind(AccountFunderService);
export const setupAndValidateWallet = AccountFunderService.setupAndValidateWallet.bind(AccountFunderService);
export const validateFundingData = AccountFunderService.validateFundingData.bind(AccountFunderService);
export const calculateRequirements = AccountFunderService.calculateRequirements.bind(AccountFunderService);
export const validateSufficientBalance = AccountFunderService.validateSufficientBalance.bind(AccountFunderService);
export const sendFundingTransactions = AccountFunderService.sendFundingTransactions.bind(AccountFunderService);
export const verifyTransactions = AccountFunderService.verifyTransactions.bind(AccountFunderService);
export const sendRelayerTransaction = AccountFunderService.sendRelayerTransaction.bind(AccountFunderService);
