#!/usr/bin/env bash

# Load utility functions from container full path
source "/tools/utils/neo-utils.sh"

# shellcheck disable=SC2155
export BRIDGE_HASH=$(jq -r '.bridge' /tools/addresses/n3-addresses.json)
# shellcheck disable=SC2155
export MESSAGE_BRIDGE_HASH=$(jq -r '.messageBridge' /tools/addresses/n3-addresses.json)
export NEON3_GOVERNOR_WALLET=/n3-wallets/governor.json

echo 'Unpausing all in BridgeContract'
echo "Using Bridge: $BRIDGE_HASH"

main_class="network.bane.scripts.token.UnpauseAll"
run_gradle_class "$main_class"

echo 'Unpausing all in MessageBridge'
echo "Using MessageBridge: $MESSAGE_BRIDGE_HASH"

main_class="network.bane.scripts.message.UnpauseAll"
run_gradle_class "$main_class"
