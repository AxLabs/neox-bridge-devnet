const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

// Configuration
const NEOX_RPC_URL = process.env.NEOX_RPC_URL || 'http://localhost:8562';

const NODE1_BASE_DIR = "../../go-ethereum/privnet/single/node1/";
const KEYSTORE_PATH = path.join(__dirname, NODE1_BASE_DIR, "keystore/UTC--2023-12-25T15-29-12.815843682Z--74f4effb0b538baec703346b03b6d9292f53a4cd");
const KEYSTORE_PASSWORD_FILE = path.join(__dirname, NODE1_BASE_DIR, "password.txt");
const SENDER_ADDRESS = "0x74f4effb0b538baec703346b03b6d9292f53a4cd";

const FUNDING_FILE = path.join(__dirname, "neox-funding.csv");

// Gas settings
const GAS_LIMIT = 21000;
const MAX_FEE_PER_GAS_GWEI = 40; // EIP-1559 max fee per gas
const MAX_PRIORITY_FEE_PER_GAS_GWEI = 25; // EIP-1559 priority fee per gas

/**
 * Read keystore password from file
 */
function getKeystorePassword() {
  console.log(`Reading keystore password from: ${KEYSTORE_PASSWORD_FILE}`);
  try {
    return fs.readFileSync(KEYSTORE_PASSWORD_FILE, 'utf8').trim();
  } catch (error) {
    console.error('Error reading keystore password file:', error);
    throw error;
  }
}

/**
 * Load private key from keystore file
 */
async function loadPrivateKeyFromKeystore() {
  const keystorePassword = getKeystorePassword();
  console.log(`Loading keystore from: ${KEYSTORE_PATH}`);
  try {
    const keystoreJson = fs.readFileSync(KEYSTORE_PATH, 'utf8');
    const wallet = await ethers.Wallet.fromEncryptedJson(keystoreJson, keystorePassword);
    return wallet.privateKey;
  } catch (error) {
    console.error("Error loading keystore:", error);
    throw error;
  }
}

/**
 * Read funding data from CSV file
 */
function readFundingCSV() {
  try {
    console.log(`Reading CSV from: ${FUNDING_FILE}`);
    const csvContent = fs.readFileSync(FUNDING_FILE, "utf8");
    const lines = csvContent.trim().split("\n");

    const fundingData = [];

    for (const line of lines) {
      const [address, amountStr] = line.split(",").map(s => s.trim());

      if (address && amountStr) {
        // Validate address format
        if (!ethers.isAddress(address)) {
          console.warn(`Invalid address format: ${address}, skipping...`);
          continue;
        }

        try {
          const amountWei = BigInt(amountStr);
          fundingData.push({
            address: ethers.getAddress(address), // Normalize address checksum
            amountWei
          });
        } catch (error) {
          console.warn(`Invalid amount for ${address}: ${amountStr}, skipping...`);
        }
      }
    }

    return fundingData;
  } catch (error) {
    console.error(`Error reading CSV file: ${error}`);
    return [];
  }
}

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
 * Transfer ETH to a single address
 */
async function transferETH(wallet, toAddress, amountWei) {
  try {
    console.log(`\nTransferring to ${toAddress}...`);
    console.log(`   Amount: ${amountWei} wei (${ethers.formatEther(amountWei)} ETH)`);

    // Use EIP-1559 gas pricing for neox network
    const tx = await wallet.sendTransaction({
      to: toAddress,
      value: amountWei,
      gasLimit: GAS_LIMIT,
      maxFeePerGas: ethers.parseUnits(MAX_FEE_PER_GAS_GWEI.toString(), "gwei"),
      maxPriorityFeePerGas: ethers.parseUnits(MAX_PRIORITY_FEE_PER_GAS_GWEI.toString(), "gwei"),
      type: 2 // EIP-1559 transaction type
    });

    console.log(`   Transaction hash: ${tx.hash}`);

    const receipt = await tx.wait();

    if (receipt?.status === 1) {
      console.log(`   Transfer successful!`);
      console.log(`   Gas used: ${receipt.gasUsed}`);
      console.log(`   Block: ${receipt.blockNumber}`);
      return true;
    } else {
      console.log(`   Transfer failed`);
      return false;
    }
  } catch (error) {
    console.error(`   Error transferring to ${toAddress}:`, error.message);
    return false;
  }
}

/**
 * Main funding function
 */
async function main() {
  console.log("Starting ETH funding script for neox addresses");
  console.log("=" + "=".repeat(59));

  // Get provider
  const provider = new ethers.JsonRpcProvider(NEOX_RPC_URL);
  console.log(`Connecting to: ${NEOX_RPC_URL}`);

  // Wait for node to be ready
  if (!(await waitForNodeReady(provider))) {
    process.exit(1);
  }

  // Load private key and create wallet
  console.log("\nLoading sender account...");
  let privateKey;
  try {
    privateKey = await loadPrivateKeyFromKeystore();
  } catch (error) {
    console.error("Failed to load private key from keystore:", error);
    process.exit(1);
  }

  const wallet = new ethers.Wallet(privateKey, provider);
  console.log(`   Sender address: ${wallet.address}`);

  // Verify it's the expected address
  if (wallet.address.toLowerCase() !== SENDER_ADDRESS.toLowerCase()) {
    console.error(`Address mismatch: expected ${SENDER_ADDRESS}, got ${wallet.address}`);
    process.exit(1);
  }

  // Check sender balance
  const senderBalance = await provider.getBalance(wallet.address);
  console.log(`   Sender balance: ${ethers.formatEther(senderBalance)} ETH (${senderBalance} wei)`);

  // Read funding data
  console.log(`\nReading funding data...`);
  const fundingData = readFundingCSV();
  if (fundingData.length === 0) {
    console.error("No valid funding data found");
    process.exit(1);
  }

  console.log(`Found ${fundingData.length} addresses to fund:`);
  let totalAmount = 0n;

  for (const entry of fundingData) {
    console.log(`   ${entry.address}: ${entry.amountWei} wei (${ethers.formatEther(entry.amountWei)} ETH)`);
    totalAmount += entry.amountWei;
  }

  console.log(`\nTotal amount to transfer: ${ethers.formatEther(totalAmount)} ETH (${totalAmount} wei)`);

  // Estimate gas costs
  const estimatedGasCost = BigInt(fundingData.length) * BigInt(GAS_LIMIT) * ethers.parseUnits(MAX_FEE_PER_GAS_GWEI.toString(), "gwei");
  const totalNeeded = totalAmount + estimatedGasCost;

  console.log(`Estimated gas cost: ${ethers.formatEther(estimatedGasCost)} ETH`);
  console.log(`Total needed: ${ethers.formatEther(totalNeeded)} ETH`);

  if (senderBalance < totalNeeded) {
    console.error(`Insufficient balance. Need ${ethers.formatEther(totalNeeded)} ETH, have ${ethers.formatEther(senderBalance)} ETH`);
    process.exit(1);
  }

  console.log("Sufficient balance available");

  // Start transfers
  console.log("\nStarting transfers...");
  let successfulTransfers = 0;
  let failedTransfers = 0;

  for (let i = 0; i < fundingData.length; i++) {
    const entry = fundingData[i];
    console.log(`\n[${i + 1}/${fundingData.length}] Processing ${entry.address}...`);

    if (await transferETH(wallet, entry.address, entry.amountWei)) {
      successfulTransfers++;
    } else {
      failedTransfers++;
    }

    // Small delay between transactions
    if (i < fundingData.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Summary
  console.log("\n" + "=" + "=".repeat(59));
  console.log("Transfer Summary:");
  console.log(`Successful transfers: ${successfulTransfers}`);
  console.log(`Failed transfers: ${failedTransfers}`);
  console.log(`Total addresses processed: ${fundingData.length}`);

  // Final balance check
  const finalBalance = await provider.getBalance(wallet.address);
  console.log(`\nFinal sender balance: ${ethers.formatEther(finalBalance)} ETH`);

  if (failedTransfers === 0) {
    console.log("All transfers completed successfully!");
    process.exit(0);
  } else {
    console.log(`${failedTransfers} transfers failed`);
    process.exit(1);
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
if (require.main === module) {
  main().catch((error) => {
    console.error("Script failed:", error);
    process.exit(1);
  });
}

module.exports = { main };
