#!/bin/bash
# wait-for-neox-funding.sh
# Waits for neox-node to be up and for the deployer wallet to be funded

set -e

# Required parameters
if [ -z "$NEOX_RPC_URL" ]; then
  echo "NEOX_RPC_URL is not set. Exiting."
  exit 1
fi
if [ -z "$DEPLOYER_WALLET_JSON" ]; then
  echo "DEPLOYER_WALLET_JSON is not set. Exiting."
  exit 1
fi
check_interval=3

# Read deployer address from wallet JSON
if [ ! -f "$DEPLOYER_WALLET_JSON" ]; then
  echo "Deployer wallet file not found: $DEPLOYER_WALLET_JSON"
  exit 1
fi
deployer_address="0x$(jq -r .address "$DEPLOYER_WALLET_JSON")"
if [ -z "$deployer_address" ] || [ "$deployer_address" == "0x" ]; then
  echo "Could not extract deployer address from $DEPLOYER_WALLET_JSON"
  exit 1
fi
# Convert to lowercase
_deployer_address=$(echo "$deployer_address" | tr '[:upper:]' '[:lower:]')
deployer_address="$_deployer_address"
#validate address format
if ! [[ "$deployer_address" =~ ^0x[a-f0-9]{40}$ ]]; then
  echo "Deployer address format is invalid: $deployer_address"
  exit 1
fi

echo "Using deployer address: $deployer_address"

# Wait for neox-node to be up
until curl -s --max-time 2 "$NEOX_RPC_URL" > /dev/null; do
  echo "Waiting for neox-node at $NEOX_RPC_URL..."
  sleep $check_interval
done

echo "neox-node is up. Checking deployer wallet funding..."

# Wait for deployer wallet to be funded
while true; do
  balance_hex=$(curl -s -X POST --data '{"jsonrpc":"2.0","method":"eth_getBalance","params":["'$deployer_address'", "latest"],"id":1}' -H "Content-Type: application/json" "$NEOX_RPC_URL" | jq -r .result)
  if [[ "$balance_hex" == "null" || -z "$balance_hex" ]]; then
    echo "Could not fetch balance. Retrying..."
    sleep $check_interval
    continue
  fi
  balance_dec=$((16#${balance_hex:2}))
  echo "Deployer balance: $balance_dec wei"
  if [ "$balance_dec" -gt 0 ]; then
    echo "Deployer wallet is funded."
    break
  fi
  echo "Waiting for deployer wallet to be funded..."
  sleep $check_interval
done

echo "Ready to deploy."
exit 0
