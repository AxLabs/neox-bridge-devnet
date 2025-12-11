#!/bin/bash

# Load utility functions from container full path
source "/tools/utils/neo-utils.sh"
source "/tools/utils/colors.sh"

# Wrapper script for deploying message bridge and extracting addresses
set -e

DEPLOY_ALL_LOG_FILE="/tmp/deploy-neox-message-bridge.log"
DEPLOY_TOKEN_LOG_FILE="/tmp/deploy-register-neo.log"
OUTPUT_FILE="/tools/addresses/neox-addresses.json"

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
npx hardhat vars set PERSONAL_WALLET_FILENAME "personal"
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

# Set native bridge configuration
print_info "Setting native bridge configuration..."
npx hardhat run scripts/setNativeBridge.ts --network neoxDevnet
print_success "Native bridge configuration completed!"

# Set token bridge configuration for NEO token - currently disabled because already done during registration step
#print_info "Setting token bridge configuration for NEO token..."
#if [ -n "$NEO_TOKEN_ADDRESS" ]; then
#    TOKEN_ADDRESS="$NEO_TOKEN_ADDRESS" npx hardhat run scripts/setTokenBridge.ts --network neoxDevnet
#    print_success "Token bridge configuration completed for NEO token!"
#else
#    print_warning "Could not extract NEO token address for token bridge configuration"
#fi

# Unpause the native bridge and token bridges
print_info "Unpausing all bridge components..."
if [ -n "$NEO_TOKEN_ADDRESS" ]; then
    TOKEN_ADDRESSES="$NEO_TOKEN_ADDRESS" \
    npx hardhat run scripts/unpause/unpauseAllBridge.ts --network neoxDevnet
    print_success "All bridge components unpaused successfully!"
else
    print_warning "Could not extract NEO token address, unpausing bridges without token addresses"
    npx hardhat run scripts/unpause/unpauseAllBridge.ts --network neoxDevnet
    print_success "Bridge components unpaused successfully!"
fi

# Unpause the MessageBridge to make it ready for messages
print_info "Unpausing MessageBridge..."
if [ -n "$MESSAGE_BRIDGE_PROXY" ]; then
    print_info "Unpausing MessageBridge at address: $MESSAGE_BRIDGE_PROXY"
    NEOX_DEVNET_RPC_URL="$NEOX_RPC_URL" \
    MESSAGE_BRIDGE_ADDRESS="$MESSAGE_BRIDGE_PROXY"\
    npx hardhat run scripts/messages/unpause/unpauseAll.ts --network neoxDevnet
    print_success "MessageBridge unpaused successfully!"
else
    print_warning "Could not extract MessageBridge address for unpausing"
fi

print_success "Deployment and address extraction completed successfully!"

print_info "Funding all bridges with initial ETH and tokens..."
BRIDGE_ADDRESS="$BRIDGE_PROXY" \
TOKEN_ADDRESS="$NEO_TOKEN_ADDRESS" \
ETH_AMOUNT=90 \
TOKEN_AMOUNT=10000 \
npx hardhat run scripts/fundAllBridges.ts --network neoxDevnet
print_success "All bridges funded successfully!"

# Keep the container running briefly to ensure everything is captured
print_info "Keeping container alive briefly to ensure all operations complete..."
sleep 2
