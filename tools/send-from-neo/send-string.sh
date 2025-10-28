#!/bin/bash

# Simple wrapper script for sending string messages from Neo N3 to EVM
# Usage: ./send-string.sh <message> [fee_sponsor]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ $# -lt 1 ]]; then
    echo "Usage: $0 <message> [fee_sponsor]"
    echo "Example: $0 \"Hello EVM World\""
    echo "Example: $0 \"Hello EVM World\" NbnjKGMBJzJ6j5PHeYhjJDaQ5Vy5UYu4Fv"
    echo ""
    echo "Note: MessageBridge hash is auto-loaded from tools/addresses/n3-addresses.json"
    exit 1
fi

MESSAGE="$1"
FEE_SPONSOR="$2"

# Build arguments for the main script
ARGS=(-t store-only -d "$MESSAGE")
if [[ -n "$FEE_SPONSOR" ]]; then
    ARGS+=(-f "$FEE_SPONSOR")
fi

"$SCRIPT_DIR/send-message.sh" "${ARGS[@]}"
