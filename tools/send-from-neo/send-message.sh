
#!/bin/bash

# Script to send messages from Neo N3 to EVM using the MessageBridge contract
# This script wraps the Java SendMessage class with convenient parameter handling

set -e

# Default values
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NEO_CONTRACTS_ROOT="$(cd "$SCRIPT_DIR/../../bridge-neo-contracts" && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

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
    -h, --help                     Show this help message

EXAMPLES:

1. Send a simple string message (store-only):
   $0 -t store-only -d "Hello EVM World"

2. Send hex-encoded EVM contract call data (store-only):
   $0 -t store-only -d 0x48656c6c6f

3. Execute an EVM contract call:
   $0 -t executable -d 0x1234abcd

4. Send with custom fee sponsor:
   $0 -t executable -d 0x5678efgh -f NbnjKGMBJzJ6j5PHeYhjJDaQ5Vy5UYu4Fv

ENVIRONMENT VARIABLES:
    NEON3_DEVNET_RPC_URL          Neo N3 RPC endpoint (default: from deploy.env)
    WALLET                        User wallet JSON file (default: wallets/deployer.json)
    WALLET_PASSWORD               Wallet password for the deployer account

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

# Check NEON3_DEVNET_RPC_URL environment variable
if [[ -z "$NEON3_DEVNET_RPC_URL" ]]; then
    # default to localhost if not set
    NEON3_DEVNET_RPC_URL="http://127.0.0.1:40332"
    print_warning "NEON3_DEVNET_RPC_URL not set. Defaulting to $NEON3_DEVNET_RPC_URL"
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
echo "  - Node: ${NEON3_DEVNET_RPC_URL}"
echo ""

# Set environment variables for the Java class
export NEON3_JSON_RPC=${NEON3_DEVNET_RPC_URL}
export MESSAGE_BRIDGE_HASH
export MESSAGE_TYPE
export MESSAGE_DATA="$MESSAGE_DATA_HEX"
if [[ -n "$FEE_SPONSOR" ]]; then
    export FEE_SPONSOR
fi
export NEON3_DEPLOYER_WALLET=${WALLET:-"wallets/deployer.json"}
export NEON3_DEPLOYER_PASSWORD=${WALLET_PASSWORD:-""}
export NEON3_OWNER_WALLET="wallets/owner.json"
export NEON3_OWNER_PASSWORD=""

# ensure `wallets` folder exists in the contracts root. if not, copy from tools/neox-funding/neox-wallets
WALLETS_DIR="$NEO_CONTRACTS_ROOT/wallets"
if [[ ! -d "$WALLETS_DIR" ]]; then
    print_warning "Wallets directory not found in contracts root. Copying from tools/neox-funding/neox-wallets..."
    mkdir -p "$WALLETS_DIR"
    cp -r "$SCRIPT_DIR/../neon3-funding/neon3-wallets/"* "$WALLETS_DIR/"
fi

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
