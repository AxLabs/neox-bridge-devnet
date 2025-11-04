import { ethers } from 'ethers';

export function isValid(address) {
  return ethers.isAddress(address);
}

export function normalize(address) {
  if (!address) return null;

  // Add 0x prefix if not present
  if (!address.startsWith('0x')) {
    address = '0x' + address;
  }

  return isValid(address) ? ethers.getAddress(address) : null;
}

export function validate(address, context = '') {
  const normalized = normalize(address);
  if (!normalized) {
    throw new Error(`Invalid address format${context ? ` for ${context}` : ''}: ${address}`);
  }
  return normalized;
}

