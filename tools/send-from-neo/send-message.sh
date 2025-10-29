#!/bin/bash

# Script to send messages from Neo N3 to EVM using the MessageBridge contract
# This script wraps the Java SendMessage class with convenient parameter handling

set -e

# Source color variables and print functions
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../utils/colors.sh"
source "$SCRIPT_DIR/../utils/neo-utils.sh"

# Default values
NEO_CONTRACTS_ROOT="$(cd "$SCRIPT_DIR/../../bridge-neo-contracts" && pwd)"

# Function to show usage
show_usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Send messages from Neo N3 to EVM using MessageBridge contract

OPTIONS:
    -a, --address ADDRESS           MessageBridge contract hash (auto-loaded from n3-addresses.json)
    -t, --type TYPE                Message type: executable or store-only (default: store-only)
    -d, --data DATA                Raw hex message data, string message, or EVM contract call data
    -f, --fee-sponsor HASH160      Fee sponsor hash160 (optional, uses sender if not set)
    -s, --store-result BOOL        Store result for executable messages (default: true)
    -n, --node URL                 Neo N3 RPC endpoint (default: http://127.0.0.1:40332)
    -h, --help                     Show this help message

EXAMPLES:

1. Send a simple string message (store-only):
   $0 -t store-only -d "Hello EVM World"

2. Send hex-encoded EVM contract call data (store-only):
   $0 -t store-only -d 0x48656c6c6f

3. Execute an EVM contract call and store result:
   $0 -t executable -d 0x1234abcd

4. Execute an EVM contract call without storing result:
   $0 -t executable -d 0x1234abcd -s false

5. Send with custom fee sponsor:
   $0 -t executable -d 0x5678efgh -f NbnjKGMBJzJ6j5PHeYhjJDaQ5Vy5UYu4Fv

6. Specify custom node:
   $0 -n http://custom-node:40332 -t store-only -d "Hello EVM World"

ENVIRONMENT VARIABLES:
    SENDER_WALLET                        User wallet JSON file (default: wallets/deployer.json)
    SENDER_WALLET_PASSWORD               Wallet password for the deployer account
EOF
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -a|--address)
            MESSAGE_BRIDGE_HASH="$2"
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
        -f|--fee-sponsor)
            FEE_SPONSOR="$2"
            shift 2
            ;;
        -s|--store-result)
            MESSAGE_STORE_RESULT="$2"
            shift 2
            ;;
        -n|--node)
            NODE_URL="$2"
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

# Auto-load MESSAGE_BRIDGE_HASH from n3-addresses.json if not provided
if [[ -z "$MESSAGE_BRIDGE_HASH" ]]; then
    ADDRESSES_FILE="$SCRIPT_DIR/../addresses/n3-addresses.json"
    if [[ -f "$ADDRESSES_FILE" ]]; then
        # Extract messageBridge address from JSON file
        MESSAGE_BRIDGE_HASH=$(grep -o '"messageBridge"[[:space:]]*:[[:space:]]*"[^"]*"' "$ADDRESSES_FILE" | grep -o '"[^"]*"$' | tr -d '"')
        if [[ -n "$MESSAGE_BRIDGE_HASH" ]]; then
            print_info "Auto-loaded MessageBridge hash from n3-addresses.json: $MESSAGE_BRIDGE_HASH"
        fi
    fi
fi

# Validate required parameters
if [[ -z "$MESSAGE_BRIDGE_HASH" ]]; then
    print_error "MessageBridge hash is required. Use -a or --address, or ensure tools/addresses/n3-addresses.json exists with messageBridge"
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
    print_error "Message data is required. Use -d or --data to provide hex data or string message"
    exit 1
fi

# Convert string message to hex if it doesn't start with 0x
if [[ ! "$MESSAGE_DATA" =~ ^0x ]]; then
    print_info "Converting string message to hex format"
    MESSAGE_DATA_HEX="0x$(echo -n "$MESSAGE_DATA" | xxd -p | tr -d '\n')"
else
    MESSAGE_DATA_HEX="$MESSAGE_DATA"
fi

# Set default for MESSAGE_STORE_RESULT
if [[ -z "$MESSAGE_STORE_RESULT" ]]; then
    MESSAGE_STORE_RESULT="true"
fi

# Set NODE_URL default if not provided
if [[ -z "$NODE_URL" ]]; then
    NODE_URL="http://127.0.0.1:40332"
    print_warning "Node URL not set. Defaulting to $NODE_URL"
fi

# Change to neo contracts directory
pushd "$NEO_CONTRACTS_ROOT" > /dev/null

# Print configuration
print_info "Sending message with configuration:"
echo "  - Bridge Hash: $MESSAGE_BRIDGE_HASH"
echo "  - Message Type: $MESSAGE_TYPE"
echo "  - Message Data (hex): $MESSAGE_DATA_HEX"
if [[ -n "$FEE_SPONSOR" ]]; then
    echo "  - Fee Sponsor: $FEE_SPONSOR"
fi
echo "  - Store Result: $MESSAGE_STORE_RESULT"
echo "  - Node: ${NODE_URL}"
echo ""

# Set environment variables for the Java class
export NEON3_JSON_RPC=${NODE_URL}
export MESSAGE_BRIDGE_HASH
export MESSAGE_TYPE
export MESSAGE_DATA="$MESSAGE_DATA_HEX"
if [[ -n "$FEE_SPONSOR" ]]; then
    export FEE_SPONSOR
fi
export MESSAGE_STORE_RESULT
export NEON3_DEPLOYER_WALLET="wallets/${SENDER_WALLET:-deployer}.json"
export NEON3_DEPLOYER_PASSWORD=${SENDER_WALLET_PASSWORD:-""}
export NEON3_OWNER_WALLET="wallets/owner.json"
export NEON3_OWNER_PASSWORD=""

# ensure `wallets` folder exists in the contracts root. if not, copy from tools/neox-funding/neox-wallets
WALLETS_DIR="$NEO_CONTRACTS_ROOT/wallets"
SOURCE_WALLETS_DIR="$SCRIPT_DIR/../neon3-funding/neon3-wallets"

# Determine required wallets, avoid duplicates if SENDER_WALLET is owner.json
if [[ "${SENDER_WALLET:-deployer}.json" == "owner.json" ]]; then
    REQUIRED_WALLETS=("owner.json")
else
    REQUIRED_WALLETS=("${SENDER_WALLET:-deployer}.json" "owner.json")
fi

for WALLET_FILE in "${REQUIRED_WALLETS[@]}"; do
    if ! ensure_wallet_exists "$SOURCE_WALLETS_DIR" "$WALLETS_DIR" "$WALLET_FILE"; then
        print_error "Wallet setup failed for $WALLET_FILE. Aborting."
        popd > /dev/null
        exit 1
    fi
done

# Run the gradle command
print_info "Executing Gradle command..."
print_info "Using Node: $NEON3_DEVNET_RPC_URL"
if ./gradlew run -PmainClass=network.bane.scripts.message.SendMessage; then
    print_success "Message sent successfully!"
else
    print_error "Failed to send message"
    popd > /dev/null
    exit 1
fi
echo "  - Message Data: $MESSAGE_DATA"
popd > /dev/null
