#!/usr/bin/env bash

# shellcheck disable=SC2155
export BRIDGE_HASH=$(jq -r '.bridge' /tools/addresses/n3-addresses.json)
# shellcheck disable=SC2034
export MESSAGE_BRIDGE_HASH=$(jq -r '.messageBridge' /tools/addresses/n3-addresses.json)
export NEON3_GOVERNOR_WALLET=/n3-wallets/governor.json

echo 'Unpausing all in BridgeContract'
echo "Using Bridge: $BRIDGE_HASH"
sh gradlew -q -PmainClass=network.bane.scripts.token.UnpauseAll run \
  2> >(grep -vE "SLF4J:|Note: (Some input files use unchecked|Recompile with -Xlint:unchecked)")

echo 'Unpausing all in MessageBridge'
echo "Using MessageBridge: $MESSAGE_BRIDGE_HASH"
sh gradlew -q -PmainClass=network.bane.scripts.message.UnpauseAll run \
  2> >(grep -vE "SLF4J:|Note: (Some input files use unchecked|Recompile with -Xlint:unchecked)")
