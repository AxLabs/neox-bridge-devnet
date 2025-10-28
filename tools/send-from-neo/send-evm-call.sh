#!/bin/bash

# Simple wrapper script for sending EVM contract call data from Neo N3 to EVM
# Usage: ./send-evm-call.sh <contract_call_hex> [store_result] [node_url]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../utils/colors.sh"

show_usage() {
    cat << EOF
Usage: $0 <contract_call_hex> [store_result] [node_url]

Parameters:
  contract_call_hex - Hex-encoded EVM contract call data (required)
  store_result      - Store execution result: true or false (optional, default: true)
  node_url          - NeoN3 RPC endpoint URL (optional, default: http://127.0.0.1:40332)

Examples:
  # Execute an EVM contract call (default node, store result)
  $0 0xa9059cbb000000000000000000000000742d35cc6cf32594532fa14e2e8b7b0a4b8e8a7c0000000000000000000000000000000000000000000000000de0b6b3a7640000

  # Execute without storing result
  $0 0x1234abcd false

  # Execute with custom node URL
  $0 0x1234abcd true http://custom-node:40332
  $0 0x1234abcd false http://custom-node:40332
EOF
}

if [[ $# -lt 1 ]]; then
    show_usage
    exit 1
fi

CONTRACT_CALL_HEX="$1"
STORE_RESULT="${2:-true}"
NODE_URL="${3:-}" # optional

# Validate hex format
if [[ ! "$CONTRACT_CALL_HEX" =~ ^0x[0-9a-fA-F]+$ ]]; then
    print_error "contract_call_hex must be a valid hex string starting with 0x"
    exit 1
fi

# Validate store_result (must be 'true' or 'false', case-insensitive)
if [[ -n "$2" && ! "$STORE_RESULT" =~ ^([Tt][Rr][Uu][Ee]|[Ff][Aa][Ll][Ss][Ee])$ ]]; then
    print_error "store_result must be 'true' or 'false' (case-insensitive)"
    show_usage
    exit 1
fi

# Validate node_url if provided
if [[ -n "$NODE_URL" && ! "$NODE_URL" =~ ^https?:// ]]; then
    print_error "node_url must start with http:// or https://"
    show_usage
    exit 1
fi

# Build arguments for the main script
ARGS=(-t executable -d "$CONTRACT_CALL_HEX" -s "$STORE_RESULT")
if [[ -n "$NODE_URL" ]]; then
    ARGS+=(-n "$NODE_URL")
fi

"$SCRIPT_DIR/send-message.sh" "${ARGS[@]}"
