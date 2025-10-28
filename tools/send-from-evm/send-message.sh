#!/bin/bash

# Script to send messages using the MessageBridge contract
# This script wraps the hardhat sendMessage.ts script with convenient parameter handling

set -e

# Source color variables and print functions
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../utils/colors.sh"

# Default values
CONTRACTS_ROOT="$(cd "$SCRIPT_DIR/../../bridge-evm-contracts" && pwd)"
NETWORK="neoxDevnet"

# Function to show usage
show_usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Send messages to MessageBridge contract

OPTIONS:
    -a, --address ADDRESS           MessageBridge contract address (auto-loaded from neox-addresses.json)
    -t, --type TYPE                Message type: executable or store-only (default: store-only)
    -d, --data DATA                Raw hex message data, string message, or Neo N3 script bytes
    -s, --store-result BOOL        Store result for executable messages (default: true)
    -n, --network NETWORK          Hardhat network (default: neoxDevnet)
    -h, --help                     Show this help message

EXAMPLES:

1. Send a simple string message (store-only):
   $0 -t store-only -d "Hello World"

2. Send hex-encoded Neo N3 script (store-only):
   $0 -t store-only -d 0x48656c6c6f

3. Execute a Neo N3 script call:
   $0 -t executable -d 0x1234abcd -s true

4. Send executable message with Neo N3 script bytes:
   $0 -t executable -d 0x0c14f61e60f6c1b1b22c1c4c5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d741627d5b52

EOF
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -a|--address)
            MESSAGE_BRIDGE_ADDRESS="$2"
            shift 2
            ;;
        -t|--type)
            MESSAGE_TYPE="$2"
            shift 2
            ;;
        -d|--data)
            MESSAGE_DATA="$2"
            shift 2
            ;;
        -s|--store-result)
            STORE_RESULT="$2"
            shift 2
            ;;
        -n|--network)
            NETWORK="$2"
            shift 2
            ;;
        -h|--help)
            show_usage
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Auto-load MESSAGE_BRIDGE_ADDRESS from neox-addresses.json if not provided
if [[ -z "$MESSAGE_BRIDGE_ADDRESS" ]]; then
    ADDRESSES_FILE="$SCRIPT_DIR/../addresses/neox-addresses.json"
    if [[ -f "$ADDRESSES_FILE" ]]; then
        # Extract messageBridge address from JSON file
        MESSAGE_BRIDGE_ADDRESS=$(grep -o '"messageBridge"[[:space:]]*:[[:space:]]*"[^"]*"' "$ADDRESSES_FILE" | grep -o '"[^"]*"$' | tr -d '"')
        if [[ -n "$MESSAGE_BRIDGE_ADDRESS" ]]; then
            print_info "Auto-loaded MessageBridge address from neox-addresses.json: $MESSAGE_BRIDGE_ADDRESS"
        fi
    fi
fi

# Validate required parameters
if [[ -z "$MESSAGE_BRIDGE_ADDRESS" ]]; then
    print_error "MessageBridge address is required. Use -a or --address, or ensure tools/addresses/neox-addresses.json exists with messageBridgeProxy"
    show_usage
    exit 1
fi

# Set default message type if not provided
if [[ -z "$MESSAGE_TYPE" ]]; then
    MESSAGE_TYPE="store-only"
fi

# Validate message type
if [[ "$MESSAGE_TYPE" != "executable" && "$MESSAGE_TYPE" != "store-only" ]]; then
    print_error "Message type must be 'executable' or 'store-only'"
    exit 1
fi

# Check if we have the required data for the message type
if [[ -z "$MESSAGE_DATA" ]]; then
    print_error "Message data is required. Use -d or --data to provide Neo N3 script bytes or string message"
    exit 1
fi

# Change to project directory
cd "$CONTRACTS_ROOT"

# Print configuration
print_info "Sending message with configuration:"
echo "  - Bridge Address: $MESSAGE_BRIDGE_ADDRESS"
echo "  - Message Type: $MESSAGE_TYPE"
echo "  - Network: $NETWORK"
echo "  - Message Data: $MESSAGE_DATA"

if [[ "$MESSAGE_TYPE" == "executable" && -n "$STORE_RESULT" ]]; then
    echo "  - Store Result: $STORE_RESULT"
fi

echo ""

# Set environment variables and run the hardhat script
export MESSAGE_BRIDGE_ADDRESS
export MESSAGE_TYPE
export MESSAGE_DATA
export STORE_RESULT
export BRIDGE_OWNER_PASSWORD=""

# Set personal wallet filename with default to owner wallet
if [[ -z "$PERSONAL_WALLET_FILENAME" ]]; then
    PERSONAL_WALLET_FILENAME="deployer"
fi
export PERSONAL_WALLET_FILENAME

# ensure `wallets` folder exists in the contracts root. if not, copy from tools/neox-funding/neox-wallets
WALLETS_DIR="$CONTRACTS_ROOT/wallets"
if [[ ! -d "$WALLETS_DIR" ]]; then
    print_warning "Wallets directory not found in contracts root. Copying from tools/neox-funding/neox-wallets..."
    mkdir -p "$WALLETS_DIR"
    cp -r "$SCRIPT_DIR/../neox-funding/neox-wallets/"* "$WALLETS_DIR/"
fi

# Configure hardhat vars with the personal wallet filename
existing_wallet_filename=$(npx hardhat vars get PERSONAL_WALLET_FILENAME || echo "")
if [[ -n "$existing_wallet_filename" && "$existing_wallet_filename" != "$PERSONAL_WALLET_FILENAME" ]]; then
    print_warning "Overriding existing hardhat PERSONAL_WALLET_FILENAME. Will restore on exit!"
fi
print_info "Setting hardhat personal wallet filename to: $PERSONAL_WALLET_FILENAME"
npx hardhat vars set PERSONAL_WALLET_FILENAME "$PERSONAL_WALLET_FILENAME"
# Reset hardhat var PERSONAL_WALLET_FILENAME to previous value or delete if previously unset
print_info "Restoring previous PERSONAL_WALLET_FILENAME on exit!"
trap '
  if [[ -n "$existing_wallet_filename" ]];
    then npx hardhat vars set PERSONAL_WALLET_FILENAME "$existing_wallet_filename";
    else npx hardhat vars delete PERSONAL_WALLET_FILENAME;
 fi
' EXIT


# Set default RPC URL if not provided externally
if [[ -z "$NEOX_DEVNET_RPC_URL" ]]; then
    NEOX_DEVNET_RPC_URL="http://neox-node:8562"
fi

# Export the RPC URL so hardhat can use it
export NEOX_DEVNET_RPC_URL

# Run the hardhat script
print_info "Executing hardhat script..."
print_info "Using RPC URL: $NEOX_DEVNET_RPC_URL"
if npx hardhat run scripts/messages/sendMessage.ts --network "$NETWORK"; then
    print_success "Message sent successfully!"
else
    print_error "Failed to send message"
    exit 1
fi
