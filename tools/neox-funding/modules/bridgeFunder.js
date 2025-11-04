import { ethers } from 'ethers';
import path from 'path';
import { readText, readJson, exists } from './utils/fileUtils.js';
import { validate } from './utils/addressUtils.js';
import { GAS_CONFIG, sendAndWait } from './transactionUtils.js';
import { loadNamedWallet, validateWallet } from './walletManager.js';

// Bridge funding configuration
const ADDRESSES_FILE = path.join(process.cwd(), "../addresses/neox-addresses.json");
const NATIVE_BRIDGE_FUNDING_ETH = process.env.NATIVE_BRIDGE_FUNDING_ETH || "100";
const TOKEN_BRIDGE_FUNDING_TOKENS = process.env.TOKEN_BRIDGE_FUNDING_TOKENS || "10000";
const MAX_WAIT_TIME_MS = 600000; // 10 minutes max wait for deployment

// Contract ABIs
const TOKEN_ABI = [
  "function balanceOf(address owner) external view returns (uint256)",
  "function transfer(address to, uint256 amount) external returns (bool)",
  "function mint(address to, uint256 amount) external returns (bool)",
  "function symbol() external view returns (string)",
  "function decimals() external view returns (uint8)"
];

/**
 * Bridge funding service
 */
class BridgeFunderService {
  static async waitForDeploymentAndFund(provider) {
    console.log(`Waiting for contract addresses file: ${ADDRESSES_FILE}`);

    const startTime = Date.now();
    const pollInterval = 5000;

    while (Date.now() - startTime < MAX_WAIT_TIME_MS) {
      if (exists(ADDRESSES_FILE)) {
        console.log("Contract addresses file found! Checking for complete deployment...");

        try {
          const addresses = this.readContractAddresses();

          if (this.hasCompleteAddresses(addresses)) {
            console.log("Both bridge and token addresses found! Waiting for full deployment to complete...");

            await this.waitForDeploymentCompletion();

            console.log("Starting bridge funding...");
            return await this.fundBridges(provider);
          } else {
            this.logIncompleteDeployment(addresses);
          }
        } catch (error) {
          console.log(`Error reading addresses file: ${error.message}. Continuing to wait...`);
        }
      } else {
        console.log("Contract addresses file not found yet, waiting...");
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    console.log("Timeout waiting for contract deployment. Bridge funding skipped.");
    return false;
  }

  static hasCompleteAddresses(addresses) {
    return addresses.bridge && addresses.neoToken;
  }

  static logIncompleteDeployment(addresses) {
    if (addresses.bridge && !addresses.neoToken) {
      console.log("Bridge deployed but token not yet available. Waiting for token deployment...");
    } else {
      console.log("Bridge address not found yet. Waiting...");
    }
  }

  static async waitForDeploymentCompletion() {
    // Wait for unpause scripts AND Neo side configuration to complete
    console.log("Waiting 60 seconds for unpause scripts and Neo side configuration to complete...");
    await new Promise(resolve => setTimeout(resolve, 60000));
  }

  static readContractAddresses() {
    const addresses = readJson(ADDRESSES_FILE, 'contract addresses');

    console.log('Found contract addresses:');
    console.log(`   Bridge: ${addresses.bridge || 'NOT_FOUND'}`);
    console.log(`   NEO Token: ${addresses.neoToken || 'NOT_FOUND'}`);

    return addresses;
  }

  static async fundBridges(provider) {
    try {
      const addresses = this.readContractAddresses();
      this.validateAddresses(addresses);

      const ownerWallet = await this.loadOwnerWallet(provider);
      const deployerWallet = await this.loadDeployerWallet(provider);

      await this.fundNativeBridge(ownerWallet, addresses.bridge);

      if (addresses.neoToken) {
        await this.fundTokenBridge(deployerWallet, addresses.bridge, addresses.neoToken);
      } else {
        console.log("NEO token address not found, skipping token bridge funding");
      }

      return true;
    } catch (error) {
      console.error(`Bridge funding failed: ${error.message}`);
      return false;
    }
  }

  static validateAddresses(addresses) {
    if (!addresses.bridge) {
      throw new Error('Bridge address not found in addresses file');
    }
  }

  static async loadOwnerWallet(provider) {
    const ownerWallet = loadNamedWallet("owner", provider);
    console.log(`Owner/Funder address: ${ownerWallet.address}`);
    await validateWallet(ownerWallet);
    return ownerWallet;
  }

  static async loadDeployerWallet(provider) {
    const ownerWallet = loadNamedWallet("deployer", provider);
    console.log(`Deployer address: ${ownerWallet.address}`);
    await validateWallet(ownerWallet);
    return ownerWallet;
  }

  static async fundNativeBridge(ownerWallet, bridgeAddress) {
    console.log(`\nFunding Native Bridge with ${NATIVE_BRIDGE_FUNDING_ETH} ETH...`);

    try {
      await this.logBridgeBalances(ownerWallet, bridgeAddress);
      await this.verifyFunderPermissions(ownerWallet, bridgeAddress);

      const actualAmount = await this.calculateFundingAmount(ownerWallet);
      await this.performBridgeStateChecks(ownerWallet, bridgeAddress);

      await this.sendETHToBridge(ownerWallet, bridgeAddress, actualAmount);
      await this.logFundingSuccess(ownerWallet, bridgeAddress);

    } catch (error) {
      console.error(`   Error funding native bridge: ${error.message}`);
      throw error;
    }
  }

  static async logBridgeBalances(ownerWallet, bridgeAddress) {
    const currentBalance = await ownerWallet.provider.getBalance(bridgeAddress);
    const ownerBalance = await ownerWallet.provider.getBalance(ownerWallet.address);

    console.log(`   Current bridge ETH balance: ${ethers.formatEther(currentBalance)} ETH`);
    console.log(`   Owner wallet balance: ${ethers.formatEther(ownerBalance)} ETH`);
  }

  static async verifyFunderPermissions(ownerWallet, bridgeAddress) {
    console.log(`   Verifying funder permissions...`);

    const bridgeContract = new ethers.Contract(bridgeAddress, [
      "function management() external view returns (address)"
    ], ownerWallet);

    const managementAddress = await bridgeContract.management();
    console.log(`   Management contract address: ${managementAddress}`);

    const managementContract = new ethers.Contract(managementAddress, [
      "function getFunder() external view returns (address)"
    ], ownerWallet);

    const expectedFunder = await managementContract.getFunder();
    console.log(`   Expected funder address: ${expectedFunder}`);
    console.log(`   Owner wallet address: ${ownerWallet.address}`);

    if (expectedFunder.toLowerCase() !== ownerWallet.address.toLowerCase()) {
      throw new Error(`Owner wallet ${ownerWallet.address} is not set as funder. Expected funder: ${expectedFunder}`);
    }

    console.log(`   Owner wallet is correctly set as funder`);
  }

  static async calculateFundingAmount(ownerWallet) {
    const gasConfig = GAS_CONFIG.toWei();
    const estimatedGasCost = BigInt(gasConfig.gasLimit) * gasConfig.maxFeePerGas;
    console.log(`   Estimated gas cost: ${ethers.formatEther(estimatedGasCost)} ETH`);

    const ownerBalance = await ownerWallet.provider.getBalance(ownerWallet.address);
    const requestedAmount = ethers.parseEther(NATIVE_BRIDGE_FUNDING_ETH);
    const maxSendable = ownerBalance - estimatedGasCost;

    if (maxSendable <= 0n) {
      throw new Error(`Insufficient balance for gas. Need at least ${ethers.formatEther(estimatedGasCost)} ETH for gas`);
    }

    // Use 90% of the smaller amount for safety
    const baseAmount = requestedAmount < maxSendable ? requestedAmount : maxSendable;
    const actualAmount = (baseAmount * 90n) / 100n;

    console.log(`   Using 90% of available amount for safety: ${ethers.formatEther(actualAmount)} ETH`);

    if (actualAmount < requestedAmount) {
      console.log(`   Reduced from requested ${ethers.formatEther(requestedAmount)} ETH to ${ethers.formatEther(actualAmount)} ETH`);
    }

    return actualAmount;
  }

  static async performBridgeStateChecks(ownerWallet, bridgeAddress) {
    console.log(`   Performing bridge state checks...`);

    try {
      const code = await ownerWallet.provider.getCode(bridgeAddress);
      console.log(`   Bridge contract code length: ${code.length} characters`);

      if (code === '0x' || code.length <= 10) {
        throw new Error(`Bridge contract appears to have no code at address ${bridgeAddress}`);
      }

      console.log(`   Bridge contract has code deployed`);

      // Verify contract is responsive
      const bridgeContract = new ethers.Contract(bridgeAddress, [
        "function management() external view returns (address)"
      ], ownerWallet);

      await bridgeContract.management();
      console.log(`   Bridge contract is responsive`);

    } catch (debugError) {
      console.log(`   Warning during bridge state check: ${debugError.message}`);
      console.log(`   Proceeding with funding attempt despite state check issues`);
    }
  }

  static async sendETHToBridge(ownerWallet, bridgeAddress, amount) {
    console.log(`   Sending ${ethers.formatEther(amount)} ETH to bridge...`);

    const result = await sendAndWait(ownerWallet, {
      to: bridgeAddress,
      value: amount
    });

    if (!result.success) {
      throw new Error(result.error);
    }

    return result;
  }

  static async logFundingSuccess(ownerWallet, bridgeAddress) {
    const newBalance = await ownerWallet.provider.getBalance(bridgeAddress);
    console.log(`   New bridge ETH balance: ${ethers.formatEther(newBalance)} ETH`);
    console.log("   Native bridge funding completed successfully!");
  }

  static async fundTokenBridge(ownerWallet, bridgeAddress, tokenAddress) {
    console.log(`\nFunding Token Bridge with ${TOKEN_BRIDGE_FUNDING_TOKENS} tokens...`);

    try {
      const tokenContract = await this.createTokenContract(ownerWallet, tokenAddress);
      const tokenInfo = await this.getTokenInfo(tokenContract, tokenAddress);

      const amountWei = ethers.parseUnits(TOKEN_BRIDGE_FUNDING_TOKENS, tokenInfo.decimals);

      await this.ensureSufficientTokenBalance(ownerWallet, tokenContract, amountWei, tokenInfo);
      await this.transferTokensToBridge(ownerWallet, tokenContract, bridgeAddress, amountWei, tokenInfo);

    } catch (error) {
      console.error(`   Error funding token bridge: ${error.message}`);
      throw error;
    }
  }

  static async createTokenContract(ownerWallet, tokenAddress) {
    const normalizedTokenAddress = validate(tokenAddress, 'token');
    console.log(`   Token address: ${normalizedTokenAddress}`);

    const code = await ownerWallet.provider.getCode(normalizedTokenAddress);
    if (code === '0x') {
      throw new Error(`No contract found at token address ${normalizedTokenAddress}`);
    }

    return new ethers.Contract(normalizedTokenAddress, TOKEN_ABI, ownerWallet);
  }

  static async getTokenInfo(tokenContract, tokenAddress) {
    try {
      const [symbol, decimals] = await Promise.all([
        tokenContract.symbol(),
        tokenContract.decimals()
      ]);
      console.log(`   Token: ${symbol} (${decimals} decimals)`);
      return { symbol, decimals, address: tokenAddress };
    } catch (error) {
      console.log(`   Warning: Could not read token metadata: ${error.message}`);
      console.log(`   Assuming standard ERC20 with 18 decimals`);
      return { symbol: 'UNKNOWN', decimals: 18, address: tokenAddress };
    }
  }

  static async ensureSufficientTokenBalance(ownerWallet, tokenContract, requiredAmount, tokenInfo) {
    let walletBalance;
    try {
      walletBalance = await tokenContract.balanceOf(ownerWallet.address);
      console.log(`   Owner wallet token balance: ${ethers.formatUnits(walletBalance, tokenInfo.decimals)} ${tokenInfo.symbol}`);
    } catch (error) {
      throw new Error(`Failed to check token balance: ${error.message}`);
    }

    if (walletBalance < requiredAmount) {
      await this.mintTokensIfNeeded(ownerWallet, tokenContract, requiredAmount, tokenInfo);
    }
  }

  static async mintTokensIfNeeded(ownerWallet, tokenContract, amount, tokenInfo) {
    console.log(`   Insufficient token balance. Attempting to mint tokens...`);

    try {
      const mintResult = await sendAndWait(ownerWallet, {
        to: tokenInfo.address,
        data: tokenContract.interface.encodeFunctionData("mint", [ownerWallet.address, amount])
      });

      if (!mintResult.success) {
        console.log(`   Could not mint tokens: ${mintResult.error}`);
        console.log(`   Please ensure owner wallet has sufficient token balance`);
        return;
      }

      console.log(`   Tokens minted successfully`);
    } catch (error) {
      console.log(`   Minting failed: ${error.message}`);
      console.log(`   Please ensure owner wallet has sufficient token balance`);
      return;
    }
  }

  static async transferTokensToBridge(ownerWallet, tokenContract, bridgeAddress, amount, tokenInfo) {
    // Check current bridge token balance
    let currentTokenBalance;
    try {
      currentTokenBalance = await tokenContract.balanceOf(bridgeAddress);
      console.log(`   Current bridge token balance: ${ethers.formatUnits(currentTokenBalance, tokenInfo.decimals)} ${tokenInfo.symbol}`);
    } catch (error) {
      throw new Error(`Failed to check bridge token balance: ${error.message}`);
    }

    // Transfer tokens to bridge
    try {
      const transferResult = await sendAndWait(ownerWallet, {
        to: tokenInfo.address,
        data: tokenContract.interface.encodeFunctionData("transfer", [bridgeAddress, amount])
      });

      if (!transferResult.success) {
        throw new Error(transferResult.error);
      }

      // Check new balance
      const newTokenBalance = await tokenContract.balanceOf(bridgeAddress);
      console.log(`   New bridge token balance: ${ethers.formatUnits(newTokenBalance, tokenInfo.decimals)} ${tokenInfo.symbol}`);
      console.log("   Token bridge funding completed successfully!");

    } catch (error) {
      throw new Error(`Token transfer failed: ${error.message}`);
    }
  }
}

// Export only the function needed by the main module
export const waitForDeploymentAndFund = BridgeFunderService.waitForDeploymentAndFund.bind(BridgeFunderService);
