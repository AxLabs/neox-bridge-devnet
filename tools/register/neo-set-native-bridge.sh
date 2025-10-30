#!/usr/bin/env bash

# shellcheck disable=SC2155
export BRIDGE_HASH=$(jq -r '.bridge' /tools/addresses/n3-addresses.json)

export NATIVE_SET_TOKEN_FOR_NATIVE_BRIDGE=0xd2a4cff31913016155e38e474a2c06d08be276cf
export NATIVE_SET_DECIMALS_ON_LINKED_CHAIN=18
export NATIVE_SET_DEPOSIT_FEE=10000000
export NATIVE_SET_MIN_AMOUNT=100000000
export NATIVE_SET_MAX_AMOUNT=1000000000000
export NATIVE_SET_MAX_WITHDRAWALS=100
export NATIVE_SET_MAX_TOTAL_DEPOSITED=10000000000000

echo ''
echo 'Setting native bridge in BridgeContract'
echo "Using Bridge: $BRIDGE_HASH"
sh gradlew -PmainClass=network.bane.scripts.token.SetNativeBridge run
