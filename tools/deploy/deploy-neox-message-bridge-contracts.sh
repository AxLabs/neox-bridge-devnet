#!/bin/bash

# Load utility functions from container full path
source "/tools/utils/neo-utils.sh"
source "/tools/utils/colors.sh"

# Wrapper script for deploying message bridge and extracting addresses
set -e

DEPLOY_ALL_LOG_FILE="/tmp/deploy-neox-message-bridge.log"
DEPLOY_TOKEN_LOG_FILE="/tmp/deploy-register-neo.log"
OUTPUT_FILE="/tools/addresses/neox-addresses.json"
OPS_NETWORK="neox-devnet"
OPS_NETWORK_CONFIG="/app/config/networks/${OPS_NETWORK}.local.json"
OPS_DEPLOYMENT_CONFIG="/app/config/deployments/${OPS_NETWORK}.local.json"
OPS_ACCOUNTS_CONFIG="/app/config/accounts/${OPS_NETWORK}.json"
OPS_N3_NEO_ADDRESS="0xef4073a0f2b305a38ec4050e4d3d28bc40ea63f5"

export OPS_DEPLOYER_PASSWORD="${OPS_DEPLOYER_PASSWORD:-}"
export OPS_OWNER_PASSWORD="${OPS_OWNER_PASSWORD:-}"
export OPS_GOVERNOR_PASSWORD="${OPS_GOVERNOR_PASSWORD:-}"
export OPS_RELAYER_PASSWORD="${OPS_RELAYER_PASSWORD:-}"
export OPS_VALIDATOR01_PASSWORD="${OPS_VALIDATOR01_PASSWORD:-}"
export OPS_VALIDATOR02_PASSWORD="${OPS_VALIDATOR02_PASSWORD:-}"
export OPS_PERSONAL_PASSWORD="${OPS_PERSONAL_PASSWORD:-}"

write_ops_network_config() {
    print_info "Writing ops network override: $OPS_NETWORK_CONFIG"
    mkdir -p "$(dirname "$OPS_NETWORK_CONFIG")"
    cat > "$OPS_NETWORK_CONFIG" <<EOF
{
  "name": "$OPS_NETWORK",
  "rpcUrl": "${NEOX_RPC_URL:-http://neox-node:8562}"
}
EOF
}

write_ops_accounts_config() {
    print_info "Writing ops accounts config: $OPS_ACCOUNTS_CONFIG"
    mkdir -p "$(dirname "$OPS_ACCOUNTS_CONFIG")"
    cat > "$OPS_ACCOUNTS_CONFIG" <<EOF
{
  "network": "$OPS_NETWORK",
  "accounts": {
    "deployer": {
      "type": "keystore",
      "path": "/app/wallets/deployer.json",
      "passwordEnv": "OPS_DEPLOYER_PASSWORD"
    },
    "owner": {
      "type": "keystore",
      "path": "/app/wallets/owner.json",
      "passwordEnv": "OPS_OWNER_PASSWORD"
    },
    "governor": {
      "type": "keystore",
      "path": "/app/wallets/governor.json",
      "passwordEnv": "OPS_GOVERNOR_PASSWORD"
    },
    "relayer": {
      "type": "keystore",
      "path": "/app/wallets/relayer.json",
      "passwordEnv": "OPS_RELAYER_PASSWORD"
    },
    "validator01": {
      "type": "keystore",
      "path": "/app/wallets/validator01.json",
      "passwordEnv": "OPS_VALIDATOR01_PASSWORD"
    },
    "validator02": {
      "type": "keystore",
      "path": "/app/wallets/validator02.json",
      "passwordEnv": "OPS_VALIDATOR02_PASSWORD"
    },
    "personal": {
      "type": "keystore",
      "path": "/app/wallets/${PERSONAL_WALLET_NAME:-personal}.json",
      "passwordEnv": "OPS_PERSONAL_PASSWORD"
    }
  }
}
EOF
}

write_ops_deployment_config() {
    print_info "Writing ops deployment override: $OPS_DEPLOYMENT_CONFIG"
    mkdir -p "$(dirname "$OPS_DEPLOYMENT_CONFIG")"
    cat > "$OPS_DEPLOYMENT_CONFIG" <<EOF
{
  "network": "$OPS_NETWORK",
  "contracts": {
    "bridge": "$BRIDGE_PROXY",
    "bridgeManagement": "$BRIDGE_MANAGEMENT_PROXY",
    "messageBridge": "$MESSAGE_BRIDGE_PROXY",
    "executionManager": "$EXECUTION_MANAGER"
  },
  "tokens": {
    "neo": {
      "neoX": "$NEO_TOKEN_ADDRESS",
      "neoN3": "$OPS_N3_NEO_ADDRESS",
      "decimals": 18,
      "symbol": "NEO"
    }
  }
}
EOF
}

write_ops_config() {
    write_ops_network_config
    write_ops_accounts_config
    write_ops_deployment_config
}

run_ops() {
    npm run ops -- "$@"
}

# Function to extract addresses
extract_addresses() {
    print_info "Extracting addresses from deployment log..."

    if [ ! -f "$DEPLOY_ALL_LOG_FILE" ]; then
        print_error "Log file not found: $DEPLOY_ALL_LOG_FILE"
        return 1
    fi

    print_info "Log file size: $(wc -l < "$DEPLOY_ALL_LOG_FILE") lines"

    # Create the output directory if it doesn't exist
    mkdir -p "$(dirname "$OUTPUT_FILE")"

    # Extract addresses using the helper function
    BRIDGE_MANAGEMENT_PROXY=$(extract_contract_address_from_log "$DEPLOY_ALL_LOG_FILE" "BridgeManagement Proxy:")
    BRIDGE_MANAGEMENT_LOGIC=$(extract_contract_address_from_log "$DEPLOY_ALL_LOG_FILE" "BridgeManagement Logic:")
    BRIDGE_PROXY=$(extract_contract_address_from_log "$DEPLOY_ALL_LOG_FILE" "Bridge Proxy:")
    BRIDGE_LOGIC=$(extract_contract_address_from_log "$DEPLOY_ALL_LOG_FILE" "Bridge Logic:")
    MESSAGE_BRIDGE_PROXY=$(extract_contract_address_from_log "$DEPLOY_ALL_LOG_FILE" "MessageBridge Proxy:")
    MESSAGE_BRIDGE_LOGIC=$(extract_contract_address_from_log "$DEPLOY_ALL_LOG_FILE" "MessageBridge Logic:")
    EXECUTION_MANAGER=$(extract_contract_address_from_log "$DEPLOY_ALL_LOG_FILE" "ExecutionManager:")
}

write_addresses_to_file() {
  print_info "Creating JSON output..."
      output_to_json "$OUTPUT_FILE" \
          "bridgeManagement" "$BRIDGE_MANAGEMENT_PROXY" \
          "bridgeManagementLogic" "$BRIDGE_MANAGEMENT_LOGIC" \
          "bridge" "$BRIDGE_PROXY" \
          "bridgeLogic" "$BRIDGE_LOGIC" \
          "messageBridge" "$MESSAGE_BRIDGE_PROXY" \
          "messageBridgeLogic" "$MESSAGE_BRIDGE_LOGIC" \
          "executionManager" "$EXECUTION_MANAGER" \
          "neoToken" "$NEO_TOKEN_ADDRESS" \

      print_success "Addresses extracted and saved to: $OUTPUT_FILE"
      print_info "Contents:"
      cat "$OUTPUT_FILE"
}

# Set up signal handlers
cleanup() {
    print_warning "Received signal, extracting addresses before exit..."
    extract_addresses
    exit 0
}

# Trap multiple signals
trap cleanup SIGTERM SIGINT SIGQUIT

print_info "Starting message bridge deployment..."

# Run the deployment process
rm -rf /app/.openzeppelin
rm -f /tools/addresses/neox-addresses.json
bash /tools/deploy/wait-for-neox-funding.sh
npm install
npx hardhat vars set NEOX_DEVNET_RPC_URL "$NEOX_RPC_URL"
write_ops_network_config
write_ops_accounts_config
npx hardhat run scripts/deployAll.ts --network neoxDevnet | tee "$DEPLOY_ALL_LOG_FILE"

# Extract addresses after successful deployment
extract_addresses

# Set BRIDGE_ADDRESS in Hardhat vars for further scripts
npx hardhat vars set BRIDGE_ADDRESS "$BRIDGE_PROXY"

# Deploy and register NEO token
npx hardhat run scripts/registration/deployTokenAndRegisterNeo.ts --network neoxDevnet | tee "$DEPLOY_TOKEN_LOG_FILE"
NEO_TOKEN_ADDRESS=$(extract_contract_address_from_log "$DEPLOY_TOKEN_LOG_FILE" "Token Address:")

# Write addresses to JSON file
write_addresses_to_file
write_ops_config

# Set native bridge configuration
print_info "Setting native bridge configuration..."
run_ops bridge configure-native --network "$OPS_NETWORK" --account governor --fee 0.001 --min 0.1 --max 100 --max-deposits 100 --decimals-here 18 --decimals-n3 8
print_success "Native bridge configuration completed!"

# Token bridge configuration for NEO is handled during the registration step above.

# Unpause the native bridge and token bridges
print_info "Unpausing all bridge components..."
run_ops bridge unpause --network "$OPS_NETWORK" --account governor --target all --token neo
print_success "All bridge components unpaused successfully!"

# Unpause the MessageBridge to make it ready for messages
print_info "Unpausing MessageBridge..."
run_ops message unpause --network "$OPS_NETWORK" --account governor --target all
print_success "MessageBridge unpaused successfully!"

print_success "Deployment and address extraction completed successfully!"

print_info "Funding all bridges with initial ETH and tokens..."
run_ops bridge fund-native --network "$OPS_NETWORK" --account owner --amount 90
run_ops bridge fund-token --network "$OPS_NETWORK" --account deployer --token neo --amount 9000
PERSONAL_WALLET_JSON="/app/wallets/${PERSONAL_WALLET_NAME:-personal}.json"
if [ -f "$PERSONAL_WALLET_JSON" ]; then
  NEOX_RPC_URL="${NEOX_RPC_URL:-http://neox-node:8562}" \
  TOKEN_ADDRESS="$NEO_TOKEN_ADDRESS" \
  TOKEN_AMOUNT=1000 \
  DEPLOYER_WALLET_JSON="/app/wallets/deployer.json" \
  PERSONAL_WALLET_JSON="$PERSONAL_WALLET_JSON" \
  CONTRACTS_ROOT="/app" \
  node /tools/neox-funding/fund-personal-neo-token.js
else
  print_warning "Skipping personal NEO token funding; wallet file not found: $PERSONAL_WALLET_JSON"
fi
print_success "All bridges funded successfully!"

# Keep the container running briefly to ensure everything is captured
print_info "Keeping container alive briefly to ensure all operations complete..."
sleep 2
