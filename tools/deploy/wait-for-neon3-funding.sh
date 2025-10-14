#!/bin/bash
# wait-for-neon3-funding.sh
# NEO N3 wrapper for the generic wait-for-funding.sh script

set -e

# Required parameters for NEO N3
if [ -z "$NEON3_JSON_RPC" ]; then
    echo "NEON3_JSON_RPC is not set. Exiting."
    exit 1
fi
if [ -z "$NEON3_DEPLOYER_WALLET" ]; then
    echo "NEON3_DEPLOYER_WALLET is not set. Exiting."
    exit 1
fi

# Call the generic wait-for-funding script with arguments
exec /tools/utils/wait-for-funding.sh "$NEON3_JSON_RPC" "$NEON3_DEPLOYER_WALLET"
