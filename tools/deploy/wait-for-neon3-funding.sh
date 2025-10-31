#!/bin/bash
# wait-for-neon3-funding.sh
# NEO N3 wrapper for the generic wait-for-funding.sh script

set -e

# Required parameters for NEO N3
if [ -z "$N3_JSON_RPC" ]; then
    echo "N3_JSON_RPC is not set. Exiting."
    exit 1
fi
if [ -z "$WALLET_FILEPATH_DEPLOYER" ]; then
    echo "WALLET_FILEPATH_DEPLOYER is not set. Exiting."
    exit 1
fi

# Call the generic wait-for-funding script with arguments
exec /tools/utils/wait-for-funding.sh "$N3_JSON_RPC" "$WALLET_FILEPATH_DEPLOYER"
