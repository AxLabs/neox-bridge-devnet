#!/bin/bash

# Simple wrapper script for sending Neo N3 script calls
# Usage: ./send-n3-script.sh <script_hex> [store_result] [network]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../utils/colors.sh"

show_usage() {
    cat << EOF
Usage: $0 <script_hex> [store_result] [network]

Parameters:
  script_hex    - Hex-encoded Neo N3 script bytes (required)
  store_result  - Store execution result: true or false (default: true)
  network       - Hardhat network (default: neoxDevnet)

Examples:
  # Execute a Neo N3 script and store the result
  $0 0x0c14f61e60f6c1b1b22c1c4c5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d741627d5b52

  # Execute a script without storing result
  $0 0x1234abcd false

  # Execute on specific network
  $0 0x5678efab true neoxDevnet
EOF
}

if [[ $# -lt 1 ]]; then
    show_usage
    exit 1
fi

SCRIPT_HEX="$1"
STORE_RESULT="${2:-true}"
NETWORK="${3:-neoxDevnet}"

# Validate hex format
if [[ ! "$SCRIPT_HEX" =~ ^0x[0-9a-fA-F]+$ ]]; then
    print_error "script_hex must be a valid hex string starting with 0x"
    exit 1
fi

# Validate store_result (must be 'true' or 'false', case-insensitive)
if [[ -n "$2" && ! "$STORE_RESULT" =~ ^([Tt][Rr][Uu][Ee]|[Ff][Aa][Ll][Ss][Ee])$ ]]; then
    print_error "store_result must be 'true' or 'false' (case-insensitive)"
    show_usage
    exit 1
fi

# Build arguments for the main script
ARGS=(-t executable -d "$SCRIPT_HEX" -s "$STORE_RESULT" -n "$NETWORK")

"$SCRIPT_DIR/send-message.sh" "${ARGS[@]}"
