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
const NEOX_WALLETS_DIR = path.join(__dirname, "./neox-wallets");

// Funding amount for neox wallet addresses
const NEOX_WALLET_FUNDING_AMOUNT_ETH = "100"; // 100 ETH for each wallet address

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
function loadWalletFromKeystore(path = KEYSTORE_PATH, password = getKeystorePassword()) {
  const keystorePassword = password;
  console.log(`Loading keystore from: ${path}`);
  try {
    const keystoreJson = fs.readFileSync(path, 'utf8');
    return ethers.Wallet.fromEncryptedJsonSync(keystoreJson, keystorePassword);
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
 * Read addresses from neox wallet JSON files
 */
function readNeoxWalletAddresses() {
  const walletAddresses = [];

  try {
    console.log(`Reading wallet addresses from: ${NEOX_WALLETS_DIR}`);

    // Check if the neox-wallets directory exists
    if (!fs.existsSync(NEOX_WALLETS_DIR)) {
      console.warn(`Neox wallets directory does not exist: ${NEOX_WALLETS_DIR}`);
      return walletAddresses;
    }

    // Read all JSON files in the neox-wallets directory
    const files = fs.readdirSync(NEOX_WALLETS_DIR).filter(file => file.endsWith('.json'));

    for (const file of files) {
      const filePath = path.join(NEOX_WALLETS_DIR, file);

      try {
        const walletJson = JSON.parse(fs.readFileSync(filePath, 'utf8'));

        if (walletJson.address) {
          // Add 0x prefix if not present and normalize to checksum address
          let address = walletJson.address;
          if (!address.startsWith('0x')) {
            address = '0x' + address;
          }

          if (ethers.isAddress(address)) {
            const checksumAddress = ethers.getAddress(address);
            const fundingAmountWei = ethers.parseEther(NEOX_WALLET_FUNDING_AMOUNT_ETH);

            walletAddresses.push({
              address: checksumAddress,
              amountWei: fundingAmountWei,
              source: file
            });

            console.log(`   Found address in ${file}: ${checksumAddress}`);
          } else {
            console.warn(`   Invalid address in ${file}: ${address}`);
          }
        } else {
          console.warn(`   No address field found in ${file}`);
        }
      } catch (error) {
        console.error(`   Error reading wallet file ${file}:`, error.message);
      }
    }

    console.log(`Found ${walletAddresses.length} wallet addresses to fund with ${NEOX_WALLET_FUNDING_AMOUNT_ETH} ETH each`);
    return walletAddresses;

  } catch (error) {
    console.error(`Error reading neox wallet directory: ${error.message}`);
    return walletAddresses;
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
 * Send ETH transaction without waiting for confirmation
 */
async function sendETHTransaction(wallet, toAddress, amountWei) {
  try {
    console.log(`   Sending transaction to ${toAddress}...`);
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
    return { success: true, txHash: tx.hash, tx: tx };
  } catch (error) {
    console.error(`   Error sending transaction to ${toAddress}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Wait for transaction confirmation and verify
 */
async function verifyTransaction(provider, txHash, toAddress) {
  try {
    console.log(`   Verifying transaction ${txHash}...`);

    const receipt = await provider.waitForTransaction(txHash, 1, 60000); // Wait up to 60 seconds

    if (receipt?.status === 1) {
      // Check balance after transfer
      const balanceAfter = await provider.getBalance(toAddress);

      console.log(`   Transaction confirmed!`);
      console.log(`   Balance after: ${ethers.formatEther(balanceAfter)} ETH`);
      console.log(`   Gas used: ${receipt.gasUsed}`);
      console.log(`   Block: ${receipt.blockNumber}`);
      return { success: true, receipt: receipt };
    } else {
      console.log(`   Transaction failed (status: ${receipt?.status})`);
      return { success: false, error: 'Transaction failed' };
    }
  } catch (error) {
    console.error(`   Error verifying transaction ${txHash}:`, error.message);
    return { success: false, error: error.message };
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
  let wallet;
  try {
    wallet = loadWalletFromKeystore().connect(provider);
  } catch (error) {
    console.error("Failed to load private key from keystore:", error);
    process.exit(1);
  }

  console.log(`   Sender address: ${wallet.address}`);

  // Verify it's the expected address
  if (wallet.address.toLowerCase() !== SENDER_ADDRESS.toLowerCase()) {
    console.error(`Address mismatch: expected ${SENDER_ADDRESS}, got ${wallet.address}`);
    process.exit(1);
  }

  // Check sender balance
  const senderBalance = await provider.getBalance(wallet.address);
  console.log(`   Sender balance: ${ethers.formatEther(senderBalance)} ETH (${senderBalance} wei)`);

  // Read funding data from CSV and neox wallets
  console.log(`\nReading funding data...`);
  const csvFundingData = readFundingCSV();
  const walletFundingData = readNeoxWalletAddresses();

  // Combine both funding sources
  const allFundingData = [...csvFundingData, ...walletFundingData];

  if (allFundingData.length === 0) {
    console.error("No valid funding data found from CSV or wallet files");
    process.exit(1);
  }

  console.log(`\nFunding Summary:`);
  console.log(`   CSV addresses: ${csvFundingData.length}`);
  console.log(`   Wallet addresses: ${walletFundingData.length}`);
  console.log(`   Total addresses to fund: ${allFundingData.length}`);

  let totalAmount = 0n;

  // Show CSV funding details
  if (csvFundingData.length > 0) {
    console.log(`\nCSV addresses to fund:`);
    for (const entry of csvFundingData) {
      console.log(`   ${entry.address}: ${entry.amountWei} wei (${ethers.formatEther(entry.amountWei)} ETH)`);
      totalAmount += entry.amountWei;
    }
  }

  // Show wallet funding details
  if (walletFundingData.length > 0) {
    console.log(`\nWallet addresses to fund:`);
    for (const entry of walletFundingData) {
      console.log(`   ${entry.address}: ${entry.amountWei} wei (${ethers.formatEther(entry.amountWei)} ETH) [from ${entry.source}]`);
      totalAmount += entry.amountWei;
    }
  }

  console.log(`\nTotal amount to transfer: ${ethers.formatEther(totalAmount)} ETH (${totalAmount} wei)`);

  // Estimate gas costs
  const estimatedGasCost = BigInt(allFundingData.length) * BigInt(GAS_LIMIT) * ethers.parseUnits(MAX_FEE_PER_GAS_GWEI.toString(), "gwei");
  const totalNeeded = totalAmount + estimatedGasCost;

  console.log(`Estimated gas cost: ${ethers.formatEther(estimatedGasCost)} ETH`);
  console.log(`Total needed: ${ethers.formatEther(totalNeeded)} ETH`);

  if (senderBalance < totalNeeded) {
    console.error(`Insufficient balance. Need ${ethers.formatEther(totalNeeded)} ETH, have ${ethers.formatEther(senderBalance)} ETH`);
    process.exit(1);
  }

  console.log("Sufficient balance available");

  // First pass: Check balances and send all transactions
  console.log("\nPhase 1: Checking balances and sending transactions...");
  const pendingTransactions = [];
  let skippedTransfers = 0;
  let failedToSend = 0;

  for (let i = 0; i < allFundingData.length; i++) {
    const entry = allFundingData[i];
    const sourceInfo = entry.source ? ` [from ${entry.source}]` : ' [from CSV]';
    console.log(`\n[${i + 1}/${allFundingData.length}] Processing ${entry.address}${sourceInfo}...`);

    // Check current balance before deciding to fund
    let currentBalance;
    try {
      currentBalance = await provider.getBalance(entry.address);
    } catch (err) {
      console.error(`   Error fetching balance for ${entry.address}:`, err.message);
      failedToSend++;
      continue;
    }

    if (currentBalance >= entry.amountWei) {
      console.log(`   Skipping: Address already has ${ethers.formatEther(currentBalance)} ETH (required: ${ethers.formatEther(entry.amountWei)} ETH)`);
      skippedTransfers++;
      continue;
    }

    // Send transaction without waiting for confirmation
    const result = await sendETHTransaction(wallet, entry.address, entry.amountWei);
    if (result.success) {
      pendingTransactions.push({
        txHash: result.txHash,
        address: entry.address,
        amount: entry.amountWei,
        sourceInfo: sourceInfo,
        index: i + 1
      });
    } else {
      failedToSend++;
    }

    // Small delay between transaction sends to avoid overwhelming the node
    if (i < allFundingData.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  console.log(`\nPhase 1 Summary:`);
  console.log(`   Transactions sent: ${pendingTransactions.length}`);
  console.log(`   Addresses skipped (already funded): ${skippedTransfers}`);
  console.log(`   Failed to send: ${failedToSend}`);

  // Second pass: Verify all pending transactions
  console.log("\nPhase 2: Verifying transaction confirmations...");
  let successfulTransfers = 0;
  let failedTransfers = 0;

  for (let i = 0; i < pendingTransactions.length; i++) {
    const pending = pendingTransactions[i];
    console.log(`\n[${i + 1}/${pendingTransactions.length}] Verifying ${pending.address}${pending.sourceInfo} (tx: ${pending.txHash})...`);

    const result = await verifyTransaction(provider, pending.txHash, pending.address);
    if (result.success) {
      successfulTransfers++;
    } else {
      failedTransfers++;
    }
  }

  // Add skipped transfers to successful count (they were already funded)
  successfulTransfers += skippedTransfers;

  // Summary
  console.log("\n" + "=" + "=".repeat(59));
  console.log("Transfer Summary:");
  console.log(`Successful transfers: ${successfulTransfers}`);
  console.log(`Failed transfers: ${failedTransfers}`);
  console.log(`Total addresses processed: ${allFundingData.length}`);
  console.log(`   CSV addresses: ${csvFundingData.length}`);
  console.log(`   Wallet addresses: ${walletFundingData.length}`);

  // Final balance check
  const finalBalance = await provider.getBalance(wallet.address);
  console.log(`\nFinal sender balance: ${ethers.formatEther(finalBalance)} ETH`);

  // Send a small transaction from the neox-wallets/relayer.json wallet to itself to increase the nonce
  console.log("\nSending small transaction from relayer wallet to itself to increase nonce...");
  const relayerWalletPath = path.join(NEOX_WALLETS_DIR, "relayer.json");
  let relayerWallet;
  try {
    const relayerJson = fs.readFileSync(relayerWalletPath, 'utf8');
    const relayerData = JSON.parse(relayerJson);
    if (!relayerData.address) {
      throw new Error("Relayer wallet JSON does not contain an address field");
    }
    relayerWallet = loadWalletFromKeystore(relayerWalletPath, "").connect(provider); // Empty password
  } catch (error) {
    console.error("Failed to load relayer wallet:", error.message);
    process.exit(1);
  }
  try {
    const smallTx = await relayerWallet.sendTransaction({
      to: relayerWallet.address,
      value: ethers.parseEther("0.0001"),
      gasLimit: GAS_LIMIT,
      maxFeePerGas: ethers.parseUnits(MAX_FEE_PER_GAS_GWEI.toString(), "gwei"),
      maxPriorityFeePerGas: ethers.parseUnits(MAX_PRIORITY_FEE_PER_GAS_GWEI.toString(), "gwei"),
      type: 2
    });
    console.log(`   Relayer transaction hash: ${smallTx.hash}`);
    await provider.waitForTransaction(smallTx.hash, 1, 60000);
    const relayerNonce = await provider.getTransactionCount(relayerWallet.address);
    console.log(`   Relayer wallet nonce after transaction: ${relayerNonce}`);
  } catch (error) {
    console.error("Failed to send relayer transaction:", error.message);
  }



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
