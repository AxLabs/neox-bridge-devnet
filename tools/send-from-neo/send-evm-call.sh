#!/bin/bash

# Simple wrapper script for sending EVM contract call data from Neo N3 to EVM
# Usage: ./send-evm-call.sh <contract_call_hex> [fee_sponsor]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ $# -lt 1 ]]; then
    echo "Usage: $0 <contract_call_hex> [fee_sponsor]"
    echo ""
    echo "Parameters:"
    echo "  contract_call_hex - Hex-encoded EVM contract call data (required)"
    echo "  fee_sponsor       - Hash160 of fee sponsor (optional, uses sender if not set)"
    echo ""
    echo "Examples:"
    echo "  # Execute an EVM contract call"
    echo "  $0 0xa9059cbb000000000000000000000000742d35cc6cf32594532fa14e2e8b7b0a4b8e8a7c0000000000000000000000000000000000000000000000000de0b6b3a7640000"
    echo ""
    echo "  # Execute with custom fee sponsor"
    echo "  $0 0x1234abcd NbnjKGMBJzJ6j5PHeYhjJDaQ5Vy5UYu4Fv"
    exit 1
fi

CONTRACT_CALL_HEX="$1"
FEE_SPONSOR="$2"

# Validate hex format
if [[ ! "$CONTRACT_CALL_HEX" =~ ^0x[0-9a-fA-F]+$ ]]; then
    echo "Error: contract_call_hex must be a valid hex string starting with 0x"
    exit 1
fi

# Build arguments for the main script
ARGS=(-t executable -d "$CONTRACT_CALL_HEX")
if [[ -n "$FEE_SPONSOR" ]]; then
    ARGS+=(-f "$FEE_SPONSOR")
fi

"$SCRIPT_DIR/send-message.sh" "${ARGS[@]}"
