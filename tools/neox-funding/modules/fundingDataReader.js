import { ethers } from 'ethers';
import path from 'path';
import { readText, readJson, exists, readDirectory } from './utils/fileUtils.js';
import { normalize } from './utils/addressUtils.js';

// Configuration paths
const FUNDING_FILE = path.join(process.cwd(), "neox-funding.csv");
const NEOX_WALLETS_DIR = path.join(process.cwd(), "neox-wallets");
const NEOX_WALLET_FUNDING_AMOUNT_ETH = "100"; // 100 ETH for each wallet address

/**
 * Funding data reading service
 */
class FundingDataReaderService {
  static readCSV() {
    try {
      console.log(`Reading CSV from: ${FUNDING_FILE}`);

      if (!exists(FUNDING_FILE)) {
        console.log("CSV funding file not found");
        return [];
      }

      const csvContent = readText(FUNDING_FILE, 'CSV funding file');
      const lines = csvContent.split("\n").map(line => line.trim()).filter(line => line);

      const fundingData = [];

      for (const line of lines) {
        const [address, amountStr] = line.split(",").map(s => s.trim());

        if (!address || !amountStr) continue;

        const normalizedAddress = normalize(address);
        if (!normalizedAddress) {
          console.warn(`Invalid address format: ${address}, skipping...`);
          continue;
        }

        try {
          const amountWei = BigInt(amountStr);
          fundingData.push({
            address: normalizedAddress,
            amountWei,
            source: 'CSV'
          });
        } catch (error) {
          console.warn(`Invalid amount for ${address}: ${amountStr}, skipping...`);
        }
      }

      return fundingData;
    } catch (error) {
      console.error(`Error reading CSV file: ${error.message}`);
      return [];
    }
  }

  static readWalletFiles() {
    const walletAddresses = [];

    try {
      console.log(`Reading wallet addresses from: ${NEOX_WALLETS_DIR}`);

      if (!exists(NEOX_WALLETS_DIR)) {
        console.warn(`Neox wallets directory does not exist: ${NEOX_WALLETS_DIR}`);
        return walletAddresses;
      }

      const jsonFiles = readDirectory(NEOX_WALLETS_DIR, file => file.endsWith('.json'));

      for (const file of jsonFiles) {
        const filePath = path.join(NEOX_WALLETS_DIR, file);

        try {
          const walletJson = readJson(filePath, `wallet file ${file}`);

          if (!walletJson.address) {
            console.warn(`   No address field found in ${file}`);
            continue;
          }

          const normalizedAddress = normalize(walletJson.address);
          if (!normalizedAddress) {
            console.warn(`   Invalid address in ${file}: ${walletJson.address}`);
            continue;
          }

          const fundingAmountWei = ethers.parseEther(NEOX_WALLET_FUNDING_AMOUNT_ETH);

          walletAddresses.push({
            address: normalizedAddress,
            amountWei: fundingAmountWei,
            source: file
          });

          console.log(`   Found address in ${file}: ${normalizedAddress}`);
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

  static readAll() {
    const csvData = this.readCSV();
    const walletData = this.readWalletFiles();
    const allData = [...csvData, ...walletData];

    console.log(`\nFunding Data Summary:`);
    console.log(`   CSV addresses: ${csvData.length}`);
    console.log(`   Wallet addresses: ${walletData.length}`);
    console.log(`   Total addresses: ${allData.length}`);

    return { csvData, walletData, allData };
  }
}

// Export only the function needed by the main module
export const readAll = FundingDataReaderService.readAll.bind(FundingDataReaderService);
