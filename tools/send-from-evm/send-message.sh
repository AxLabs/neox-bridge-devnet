#!/bin/bash

# Script to send messages using the bridge-evm-contracts ops CLI.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../utils/colors.sh"

CONTRACTS_ROOT="$(cd "$SCRIPT_DIR/../../bridge-evm-contracts" && pwd)"
NETWORK="neox-devnet"
MESSAGE_TYPE="store-only"
STORE_RESULT="true"

show_usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Send messages to MessageBridge contract

OPTIONS:
    -a, --address ADDRESS           MessageBridge contract address (auto-loaded from neox-addresses.json)
    -t, --type TYPE                 Message type: executable or store-only (default: store-only)
    -d, --data DATA                 Raw hex message data, string message, or Neo N3 script bytes
    -s, --store-result BOOL         Store result for executable messages (default: true)
    -n, --network NETWORK           Ops network (default: neox-devnet; neoxDevnet is accepted)
    -h, --help                      Show this help message

EXAMPLES:

1. Send a simple string message (store-only):
   $0 -t store-only -d "Hello World"

2. Send hex-encoded Neo N3 script (store-only):
   $0 -t store-only -d 0x48656c6c6f

3. Execute a Neo N3 script call:
   $0 -t executable -d 0x1234abcd -s true

EOF
}

normalize_network() {
    case "$1" in
        neoxDevnet) echo "neox-devnet" ;;
        *) echo "$1" ;;
    esac
}

account_for_wallet_name() {
    case "$1" in
        deployer|owner|governor|relayer|validator01|validator02) echo "$1" ;;
        *) echo "personal" ;;
    esac
}

require_ops_config_file() {
    local config_path="$1"
    local description="$2"

    if [[ ! -f "$config_path" ]]; then
        print_error "Missing $description: $config_path"
        print_error "Run the NeoX deployment first so it can generate local ops config for $NETWORK."
        exit 1
    fi
}

encode_message_data() {
    local data="$1"
    if [[ "$data" =~ ^0x[0-9a-fA-F]*$ ]]; then
        printf '%s' "$data"
        return 0
    fi
    if [[ "$data" == 0x* ]]; then
        print_error "Hex message data must contain only hexadecimal characters"
        return 1
    fi
    node -e 'process.stdout.write("0x" + Buffer.from(process.argv[1], "utf8").toString("hex"))' "$data"
}

write_ops_accounts_config() {
    local accounts_config="$CONTRACTS_ROOT/config/accounts/${NETWORK}.json"
    local wallet_name="${PERSONAL_WALLET_FILENAME:-deployer}"
    mkdir -p "$(dirname "$accounts_config")"
    cat > "$accounts_config" <<EOF
{
  "network": "$NETWORK",
  "accounts": {
    "deployer": {
      "type": "keystore",
      "path": "$SCRIPT_DIR/../neox-funding/neox-wallets/deployer.json",
      "passwordEnv": "OPS_DEPLOYER_PASSWORD"
    },
    "owner": {
      "type": "keystore",
      "path": "$SCRIPT_DIR/../neox-funding/neox-wallets/owner.json",
      "passwordEnv": "OPS_OWNER_PASSWORD"
    },
    "governor": {
      "type": "keystore",
      "path": "$SCRIPT_DIR/../neox-funding/neox-wallets/governor.json",
      "passwordEnv": "OPS_GOVERNOR_PASSWORD"
    },
    "relayer": {
      "type": "keystore",
      "path": "$SCRIPT_DIR/../neox-funding/neox-wallets/relayer.json",
      "passwordEnv": "OPS_RELAYER_PASSWORD"
    },
    "validator01": {
      "type": "keystore",
      "path": "$SCRIPT_DIR/../neox-funding/neox-wallets/validator01.json",
      "passwordEnv": "OPS_VALIDATOR01_PASSWORD"
    },
    "validator02": {
      "type": "keystore",
      "path": "$SCRIPT_DIR/../neox-funding/neox-wallets/validator02.json",
      "passwordEnv": "OPS_VALIDATOR02_PASSWORD"
    },
    "personal": {
      "type": "keystore",
      "path": "$SCRIPT_DIR/../neox-funding/neox-wallets/${wallet_name}.json",
      "passwordEnv": "OPS_PERSONAL_PASSWORD"
    }
  }
}
EOF
}

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
            NETWORK="$(normalize_network "$2")"
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

if [[ -z "$MESSAGE_BRIDGE_ADDRESS" ]]; then
    ADDRESSES_FILE="$SCRIPT_DIR/../addresses/neox-addresses.json"
    if [[ -f "$ADDRESSES_FILE" ]]; then
        MESSAGE_BRIDGE_ADDRESS=$(grep -o '"messageBridge"[[:space:]]*:[[:space:]]*"[^"]*"' "$ADDRESSES_FILE" | grep -o '"[^"]*"$' | tr -d '"')
        if [[ -n "$MESSAGE_BRIDGE_ADDRESS" ]]; then
            print_info "Auto-loaded MessageBridge address from neox-addresses.json: $MESSAGE_BRIDGE_ADDRESS"
        fi
    fi
fi

if [[ -z "$MESSAGE_BRIDGE_ADDRESS" ]]; then
    print_error "MessageBridge address is required. Use -a or --address, or ensure tools/addresses/neox-addresses.json exists."
    show_usage
    exit 1
fi

if [[ "$MESSAGE_TYPE" != "executable" && "$MESSAGE_TYPE" != "store-only" ]]; then
    print_error "Message type must be 'executable' or 'store-only'"
    exit 1
fi

if [[ -z "$MESSAGE_DATA" ]]; then
    print_error "Message data is required. Use -d or --data to provide Neo N3 script bytes or string message"
    exit 1
fi

if [[ ! "$STORE_RESULT" =~ ^([Tt][Rr][Uu][Ee]|[Ff][Aa][Ll][Ss][Ee])$ ]]; then
    print_error "store-result must be 'true' or 'false'"
    exit 1
fi

MESSAGE_DATA_HEX="$(encode_message_data "$MESSAGE_DATA")"
PERSONAL_WALLET_FILENAME="${PERSONAL_WALLET_FILENAME:-deployer}"
OPS_ACCOUNT="${OPS_ACCOUNT:-$(account_for_wallet_name "$PERSONAL_WALLET_FILENAME")}"

export OPS_DEPLOYER_PASSWORD="${OPS_DEPLOYER_PASSWORD:-}"
export OPS_OWNER_PASSWORD="${OPS_OWNER_PASSWORD:-}"
export OPS_GOVERNOR_PASSWORD="${OPS_GOVERNOR_PASSWORD:-}"
export OPS_RELAYER_PASSWORD="${OPS_RELAYER_PASSWORD:-}"
export OPS_VALIDATOR01_PASSWORD="${OPS_VALIDATOR01_PASSWORD:-}"
export OPS_VALIDATOR02_PASSWORD="${OPS_VALIDATOR02_PASSWORD:-}"
export OPS_PERSONAL_PASSWORD="${OPS_PERSONAL_PASSWORD:-}"

require_ops_config_file "$CONTRACTS_ROOT/config/networks/${NETWORK}.local.json" "ops network override"
require_ops_config_file "$CONTRACTS_ROOT/config/deployments/${NETWORK}.local.json" "ops deployment override"
write_ops_accounts_config
cd "$CONTRACTS_ROOT"

print_info "Sending message with configuration:"
echo "  - Bridge Address: $MESSAGE_BRIDGE_ADDRESS"
echo "  - Message Type: $MESSAGE_TYPE"
echo "  - Network: $NETWORK"
echo "  - Account: $OPS_ACCOUNT"
echo "  - Message Data: $MESSAGE_DATA_HEX"
if [[ "$MESSAGE_TYPE" == "executable" ]]; then
    echo "  - Store Result: $STORE_RESULT"
fi
echo ""

if [[ "$MESSAGE_TYPE" == "executable" ]]; then
    npm run ops -- message send-executable --network "$NETWORK" --account "$OPS_ACCOUNT" --message-bridge "$MESSAGE_BRIDGE_ADDRESS" --message "$MESSAGE_DATA_HEX" --store-result "$STORE_RESULT"
else
    npm run ops -- message send-store-only --network "$NETWORK" --account "$OPS_ACCOUNT" --message-bridge "$MESSAGE_BRIDGE_ADDRESS" --message "$MESSAGE_DATA_HEX"
fi

print_success "Message sent successfully!"
