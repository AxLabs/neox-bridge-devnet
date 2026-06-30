#!/usr/bin/env node

import fs from 'fs';
import { ethers } from 'ethers';

const ERC20_ABI = [
  'function decimals() view returns (uint8)',
  'function balanceOf(address account) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)'
];

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function readKeystoreAddress(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Wallet file not found: ${filePath}`);
  const wallet = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!wallet.address) throw new Error(`Wallet file has no address: ${filePath}`);
  return wallet.address.startsWith('0x') ? wallet.address : `0x${wallet.address}`;
}

async function main() {
  const rpcUrl = process.env.NEOX_RPC_URL || 'http://neox-node:8562';
  const tokenAddress = requiredEnv('TOKEN_ADDRESS');
  const tokenAmount = process.env.TOKEN_AMOUNT || '1000';
  const deployerWalletJson = process.env.DEPLOYER_WALLET_JSON || '/app/wallets/deployer.json';
  const personalWalletJson = process.env.PERSONAL_WALLET_JSON || `/app/wallets/${process.env.PERSONAL_WALLET_NAME || 'personal'}.json`;
  const deployerPassword = process.env.OPS_DEPLOYER_PASSWORD || process.env.DEPLOYER_WALLET_PASSWORD || '';

  if (!fs.existsSync(deployerWalletJson)) throw new Error(`Deployer wallet file not found: ${deployerWalletJson}`);
  const personalAddress = readKeystoreAddress(personalWalletJson);
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const deployer = (await ethers.Wallet.fromEncryptedJson(fs.readFileSync(deployerWalletJson, 'utf8'), deployerPassword)).connect(provider);
  const token = new ethers.Contract(tokenAddress, ERC20_ABI, deployer);
  const decimals = await token.decimals();
  const amount = ethers.parseUnits(tokenAmount, decimals);
  const balance = await token.balanceOf(deployer.address);

  console.log('Personal NEO token funding');
  console.log(`  Token:              ${tokenAddress}`);
  console.log(`  Sender:             ${deployer.address}`);
  console.log(`  Recipient:          ${personalAddress}`);
  console.log(`  Amount:             ${ethers.formatUnits(amount, decimals)} (${amount.toString()} raw)`);
  console.log(`  Sender balance:     ${ethers.formatUnits(balance, decimals)} (${balance.toString()} raw)`);

  if (balance < amount) {
    throw new Error(`Insufficient token balance: need ${ethers.formatUnits(amount, decimals)}, have ${ethers.formatUnits(balance, decimals)}`);
  }

  const tx = await token.transfer(personalAddress, amount);
  console.log(`  Transaction:        ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`  Status:             ${receipt.status === 1 ? 'success' : 'failed'}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
