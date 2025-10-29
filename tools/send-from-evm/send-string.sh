#!/bin/bash

# Simple wrapper script for sending string messages
# Usage: ./send-string.sh <message> [network]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../utils/colors.sh"

show_usage() {
    cat << EOF
Usage: $0 <message> [network]

Example: $0 "Hello World" neoxDevnet

Note: MessageBridge address is auto-loaded from tools/addresses/neox-addresses.json
EOF
}

if [[ $# -lt 1 ]]; then
    show_usage
    exit 1
fi

MESSAGE="$1"
NETWORK="${2:-neoxDevnet}"

# Validate network if provided (must be non-empty string)
if [[ -n "$2" && -z "$NETWORK" ]]; then
    print_error "network must be a non-empty string"
    show_usage
    exit 1
fi

# Build arguments for the main script
ARGS=(-t store-only -d "$MESSAGE" -n "$NETWORK")

"$SCRIPT_DIR/send-message.sh" "${ARGS[@]}"
