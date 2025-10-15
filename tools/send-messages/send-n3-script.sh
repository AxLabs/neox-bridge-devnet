#!/bin/bash

# Simple wrapper script for sending Neo N3 script calls
# Usage: ./send-n3-script.sh <script_hex> [type] [store_result] [network]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ $# -lt 1 ]]; then
    echo "Usage: $0 <script_hex> [type] [store_result] [network]"
    echo ""
    echo "Parameters:"
    echo "  script_hex    - Hex-encoded Neo N3 script bytes (required)"
    echo "  type          - Message type: executable or store-only (default: executable)"
    echo "  store_result  - Store execution result: true or false (default: true)"
    echo "  network       - Hardhat network (default: neoxDevnet)"
    echo ""
    echo "Examples:"
    echo "  # Execute a Neo N3 script and store the result"
    echo "  $0 0x0c14f61e60f6c1b1b22c1c4c5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d741627d5b52"
    echo ""
    echo "  # Execute a script without storing result"
    echo "  $0 0x1234abcd executable false"
    echo ""
    echo "  # Store-only message with script bytes"
    echo "  $0 0x5678efab store-only true localhost"
    exit 1
fi

SCRIPT_HEX="$1"
MESSAGE_TYPE="${2:-executable}"
STORE_RESULT="${3:-true}"
NETWORK="${4:-neoxDevnet}"

# Validate hex format
if [[ ! "$SCRIPT_HEX" =~ ^0x[0-9a-fA-F]+$ ]]; then
    echo "Error: script_hex must be a valid hex string starting with 0x"
    exit 1
fi

"$SCRIPT_DIR/send-message.sh" -t "$MESSAGE_TYPE" -d "$SCRIPT_HEX" -s "$STORE_RESULT" -n "$NETWORK"
