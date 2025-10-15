#!/bin/bash
# wait-for-neox-funding.sh
# Ethereum wrapper for the generic wait-for-funding.sh script

set -e

# Required parameters for Ethereum
if [ -z "$NEOX_RPC_URL" ]; then
    echo "NEOX_RPC_URL is not set. Exiting."
    exit 1
fi
if [ -z "$DEPLOYER_WALLET_JSON" ]; then
    echo "DEPLOYER_WALLET_JSON is not set. Exiting."
    exit 1
fi

# Call the generic wait-for-funding script with arguments
exec /tools/utils/wait-for-funding.sh "$NEOX_RPC_URL" "$DEPLOYER_WALLET_JSON"
