#!/bin/bash

# Simple wrapper script for sending string messages
# Usage: ./send-string.sh <message> [network]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ $# -lt 1 ]]; then
    echo "Usage: $0 <message> [network]"
    echo "Example: $0 \"Hello World\" neoxDevnet"
    echo ""
    echo "Note: MessageBridge address is auto-loaded from tools/addresses/neox-addresses.json"
    exit 1
fi

MESSAGE="$1"
NETWORK="${2:-neoxDevnet}"

"$SCRIPT_DIR/send-message.sh" -t store-only -d "$MESSAGE" -n "$NETWORK"
