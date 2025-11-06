import {ethers} from 'ethers';
import path from 'path';

// Import only the specific functions we need
import {
  calculateRequirements,
  sendFundingTransactions,
  sendRelayerTransaction,
  setupAndValidateWallet,
  setupProvider,
  validateFundingData,
  validateSufficientBalance,
  verifyTransactions,
} from './modules/accountFunder.js';
import { readAll } from './modules/fundingDataReader.js';

// Configuration
const NEOX_RPC_URL = process.env.NEOX_RPC_URL || 'http://localhost:8562';
const NODE1_BASE_DIR = "../../go-ethereum/privnet/single/node1/";
const KEYSTORE_PATH = path.join(process.cwd(), NODE1_BASE_DIR, "keystore/UTC--2023-12-25T15-29-12.815843682Z--74f4effb0b538baec703346b03b6d9292f53a4cd");
const SENDER_ADDRESS = "0x74f4effb0b538baec703346b03b6d9292f53a4cd";

/**
 * Wait for node to be ready
 */
async function waitForNodeReady(provider, maxRetries = 60) {
  console.log("Waiting for neox node to be ready...");

  for (let i = 0; i < maxRetries; i++) {
    try {
      const blockNumber = await provider.getBlockNumber();
      console.log(`Node is ready. Current block: ${blockNumber}`);
      return true;
    } catch (error) {
      console.log(`Attempt ${i + 1}/${maxRetries}: Node not ready yet (${error.message})`);
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
    }
  }

  console.error("Node is not ready after maximum retries");
  return false;
}

/**
 * Main funding function
 */
async function main() {
  console.log("Starting ETH funding script for neox addresses");
  console.log("=".repeat(60));

  // Setup and validation
  const provider = await setupProvider(NEOX_RPC_URL);

  if (!(await waitForNodeReady(provider))) {
    process.exit(1);
  }

  const wallet = await setupAndValidateWallet(provider, KEYSTORE_PATH, SENDER_ADDRESS);
  const senderBalance = await provider.getBalance(wallet.address);

  // Read and validate funding data
  console.log(`\nReading funding data...`);
  const { allData } = readAll();
  validateFundingData(allData);

  // Calculate requirements and validate balance
  const { totalAmount, estimatedGasCost } = calculateRequirements(allData);
  validateSufficientBalance(senderBalance, totalAmount, estimatedGasCost);

  // Execute funding process
  const sendResults = await sendFundingTransactions(provider, wallet, allData);
  const verifyResults = await verifyTransactions(provider, sendResults.pendingTransactions);

  const totalSuccessful = verifyResults.successfulTransfers + sendResults.skippedTransfers;

  // Summary logging
  console.log("\n" + "=" + "=".repeat(59));
  console.log("Transfer Summary:");
  console.log(`Successful transfers: ${totalSuccessful}`);
  console.log(`Failed transfers: ${verifyResults.failedTransfers}`);
  console.log(`Total addresses processed: ${allData.length}`);

  // Final balance check and relayer transaction
  const finalBalance = await provider.getBalance(wallet.address);
  console.log(`\nFinal sender balance: ${ethers.formatEther(finalBalance)} ETH`);

  await sendRelayerTransaction(provider);

  // Final overall summary
  if (verifyResults.failedTransfers === 0) {
    console.log("All account transfers completed successfully!");
  } else {
    console.log(`${verifyResults.failedTransfers} account transfers failed`);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Execute the script
main().catch((error) => {
  console.error('Script failed:', error);
  process.exit(1);
});
