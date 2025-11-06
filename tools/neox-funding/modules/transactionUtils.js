import { ethers } from 'ethers';

/**
 * Gas configuration object
 */
export const GAS_CONFIG = {
  limit: 21000,
  maxFeePerGas: 40, // gwei
  maxPriorityFeePerGas: 25, // gwei

  toWei() {
    return {
      gasLimit: this.limit,
      maxFeePerGas: ethers.parseUnits(this.maxFeePerGas.toString(), "gwei"),
      maxPriorityFeePerGas: ethers.parseUnits(this.maxPriorityFeePerGas.toString(), "gwei"),
      type: 2
    };
  }
};

/**
 * Transaction service
 */
class TransactionService {
  static createGasOptions() {
    return GAS_CONFIG.toWei();
  }

  static async sendTransaction(wallet, options) {
    const txOptions = {
      ...this.createGasOptions(),
      ...options
    };

    console.log(`   Sending transaction to ${txOptions.to}...`);
    if (txOptions.value) {
      console.log(`   Amount: ${txOptions.value} wei (${ethers.formatEther(txOptions.value)} ETH)`);
    }

    try {
      const tx = await wallet.sendTransaction(txOptions);
      console.log(`   Transaction hash: ${tx.hash}`);
      return { success: true, txHash: tx.hash, tx };
    } catch (error) {
      console.error(`   Error sending transaction:`, error.message);
      return { success: false, error: error.message };
    }
  }

  static async waitForTransaction(provider, txHash, timeout = 60000) {
    try {
      console.log(`   Waiting for confirmation...`);
      const receipt = await provider.waitForTransaction(txHash, 1, timeout);

      if (receipt?.status === 1) {
        console.log(`   Transaction confirmed in block ${receipt.blockNumber}`);
        console.log(`   Gas used: ${receipt.gasUsed}`);
        return { success: true, receipt };
      } else {
        console.log(`   Transaction failed (status: ${receipt?.status})`);
        return { success: false, error: 'Transaction failed', receipt };
      }
    } catch (error) {
      console.error(`   Error waiting for transaction:`, error.message);
      return { success: false, error: error.message };
    }
  }

  static async waitAndVerify(provider, txHash, toAddress = null, timeout = 60000) {
    try {
      console.log(`   Verifying transaction ${txHash}...`);

      const waitResult = await this.waitForTransaction(provider, txHash, timeout);

      if (waitResult.success) {
        if (toAddress) {
          const balanceAfter = await provider.getBalance(toAddress);
          console.log(`   Balance after: ${ethers.formatEther(balanceAfter)} ETH`);
        }
        return waitResult;
      } else {
        // Enhanced error reporting for failed transactions
        console.log(`Transaction failed: ${waitResult.error}`);
        return waitResult;
      }
    } catch (error) {
      console.error(`   Error verifying transaction ${txHash}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  static async sendAndWait(wallet, options, timeout = 60000) {
    const sendResult = await this.sendTransaction(wallet, options);
    if (!sendResult.success) {
      return sendResult;
    }

    const verifyResult = await this.waitAndVerify(wallet.provider, sendResult.txHash, options.to, timeout);

    return {
      success: verifyResult.success,
      txHash: sendResult.txHash,
      receipt: verifyResult.receipt,
      error: verifyResult.error
    };
  }
}

// Export only the methods needed by other modules
export const sendTransaction = TransactionService.sendTransaction.bind(TransactionService);
export const waitAndVerify = TransactionService.waitAndVerify.bind(TransactionService);
export const sendAndWait = TransactionService.sendAndWait.bind(TransactionService);
