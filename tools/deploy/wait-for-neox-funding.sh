#!/bin/bash
# wait-for-neox-funding.sh
# Waits for neox-node to be up and for the deployer wallet to be funded

# Load utility functions from container full path
source "/tools/utils/neo-utils.sh"

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
if ! address=$(read_wallet_address "$DEPLOYER_WALLET_JSON"); then
  exit 1
fi

echo "Using deployer address: $address"

# Wait for neox-node to be up
wait_for_node "$NEOX_RPC_URL"

echo "neox-node is up. Checking deployer wallet funding..."

# Wait for deployer wallet to be funded
while true; do
  balance_hex=$(curl -s -X POST --data '{"jsonrpc":"2.0","method":"eth_getBalance","params":["'"$address"'", "latest"],"id":1}' -H "Content-Type: application/json" "$NEOX_RPC_URL" | jq -r .result)
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
