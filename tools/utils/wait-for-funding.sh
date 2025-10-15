#!/bin/bash
# wait-for-funding.sh
# Generic script that waits for a node to be up and for the deployer wallet to be funded
# Usage: ./wait-for-funding.sh <node_url> <deployer_wallet_json>

# Load utility functions from container full path
source "/tools/utils/neo-utils.sh"

set -e

# Required parameters
if [ $# -lt 2 ]; then
    echo "Error: Both node_url and deployer_wallet_json parameters are required"
    echo "Usage: $0 <node_url> <deployer_wallet_json>"
    echo "Example: $0 http://neon3-node:40332 /n3-wallets/deployer.json"
    exit 1
fi

node_url="$1"
deployer_wallet_json="$2"

check_interval=3

# Generic function to wait for sufficient balance
wait_for_sufficient_balance() {
    local address="$1"
    local get_balance_func="$2"
    local blockchain_name="$3"
    local currency_name="$4"

    echo "Detected $blockchain_name address format"

    while true; do
        local balance
        balance=$($get_balance_func "$node_url" "$address")

        if [[ "$balance" == "0" ]]; then
            echo "Could not fetch $currency_name balance. Retrying..."
            sleep $check_interval
            continue
        fi

        echo "Deployer $currency_name balance: $balance"

        # Check if balance is greater than 0
        if [[ "$balance" =~ ^[0-9]+$ ]] && [ "$balance" -gt 0 ]; then
            echo "$blockchain_name deployer wallet is funded with $currency_name."
            break
        fi

        echo "Waiting for $blockchain_name deployer wallet to be funded with $currency_name..."
        sleep $check_interval
    done
}

# Read deployer address from wallet JSON
if ! address=$(read_wallet_address "$deployer_wallet_json"); then
    exit 1
fi

echo "Using deployer address: $address"

# Wait for node to be up
wait_for_node "$node_url"

echo "Node is up. Checking deployer wallet funding..."

# Detect blockchain type based on address format
if [[ "$address" =~ ^[A-Za-z0-9]{34}$ ]]; then
    # NEO N3 address (Base58 format)
    wait_for_sufficient_balance "$address" "get_neo3_balance" "NEO N3" "GAS (raw units)"

elif [[ "$address" =~ ^0x[0-9a-fA-F]{40}$ ]]; then
    # Ethereum address (hex format)
    wait_for_sufficient_balance "$address" "get_ethereum_balance" "Ethereum" "balance (wei)"

else
    echo "Error: Unknown address format: $address"
    exit 1
fi

echo "Ready to deploy."
exit 0
