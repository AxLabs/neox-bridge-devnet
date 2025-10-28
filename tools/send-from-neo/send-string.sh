#!/bin/bash

# Simple wrapper script for sending string messages from Neo N3 to EVM
# Usage: ./send-string.sh <message> [node_url]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../utils/colors.sh"

show_usage() {
    cat << EOF
Usage: $0 <message> [node_url]

Example: $0 "Hello EVM World"
Example: $0 "Hello EVM World" http://custom-node:40332

Note: MessageBridge hash is auto-loaded from tools/addresses/n3-addresses.json
EOF
}

if [[ $# -lt 1 ]]; then
    show_usage
    exit 1
fi

MESSAGE="$1"
NODE_URL="$2"

# Validate node_url if provided
if [[ -n "$NODE_URL" && ! "$NODE_URL" =~ ^https?:// ]]; then
    print_error "node_url must start with http:// or https://"
    show_usage
    exit 1
fi

# Build arguments for the main script
ARGS=(-t store-only -d "$MESSAGE")
if [[ -n "$NODE_URL" ]]; then
    ARGS+=(-n "$NODE_URL")
fi

"$SCRIPT_DIR/send-message.sh" "${ARGS[@]}"
