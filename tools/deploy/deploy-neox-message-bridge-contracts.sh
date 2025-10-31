#!/bin/bash

# Load utility functions from container full path
source "/tools/utils/neo-utils.sh"

# Wrapper script for deploying message bridge and extracting addresses
set -e

DEPLOY_ALL_LOG_FILE="/tmp/deploy-neox-message-bridge.log"
DEPLOY_TOKEN_LOG_FILE="/tmp/deploy-register-neo.log"
OUTPUT_FILE="/tools/addresses/neox-addresses.json"

# Function to extract addresses
extract_addresses() {
    echo "Extracting addresses from deployment log..."

    if [ ! -f "$DEPLOY_ALL_LOG_FILE" ]; then
        echo "Log file not found: $DEPLOY_ALL_LOG_FILE"
        return 1
    fi

    echo "Log file size: $(wc -l < "$DEPLOY_ALL_LOG_FILE") lines"

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
  echo "Creating JSON output..."
      output_to_json "$OUTPUT_FILE" \
          "bridgeManagement" "$BRIDGE_MANAGEMENT_PROXY" \
          "bridgeManagementLogic" "$BRIDGE_MANAGEMENT_LOGIC" \
          "bridge" "$BRIDGE_PROXY" \
          "bridgeLogic" "$BRIDGE_LOGIC" \
          "messageBridge" "$MESSAGE_BRIDGE_PROXY" \
          "messageBridgeLogic" "$MESSAGE_BRIDGE_LOGIC" \
          "executionManager" "$EXECUTION_MANAGER" \
          "neoToken" "$NEO_TOKEN_ADDRESS" \

      echo "Addresses extracted and saved to: $OUTPUT_FILE"
      echo "Contents:"
      cat "$OUTPUT_FILE"
}

# Set up signal handlers
cleanup() {
    echo "Received signal, extracting addresses before exit..."
    extract_addresses
    exit 0
}

# Trap multiple signals
trap cleanup SIGTERM SIGINT SIGQUIT

echo "Starting message bridge deployment..."

# Run the deployment process
rm -rf /app/.openzeppelin
bash /tools/deploy/wait-for-neox-funding.sh
npm install
npx hardhat vars set NEOX_DEVNET_RPC_URL "$NEOX_RPC_URL"
npx hardhat run scripts/deployAll.ts --network neoxDevnet | tee "$DEPLOY_ALL_LOG_FILE"

# Extract addresses after successful deployment
extract_addresses

# Set BRIDGE_ADDRESS in Hardhat vars for further scripts
npx hardhat vars set BRIDGE_ADDRESS "$BRIDGE_PROXY"

# Deploy and register NEO token
npx hardhat run scripts/deployTokenAndRegisterNeo.ts --network neoxDevnet | tee "$DEPLOY_TOKEN_LOG_FILE"
NEO_TOKEN_ADDRESS=$(extract_contract_address_from_log "$DEPLOY_TOKEN_LOG_FILE" "Token Address:")

# Write addresses to JSON file
write_addresses_to_file

# Unpause the MessageBridge to make it ready for messages
echo "Unpausing MessageBridge..."
if [ -n "$MESSAGE_BRIDGE_PROXY" ]; then
    echo "Unpausing MessageBridge at address: $MESSAGE_BRIDGE_PROXY"
    NEOX_DEVNET_RPC_URL="$NEOX_RPC_URL" MESSAGE_BRIDGE_ADDRESS="$MESSAGE_BRIDGE_PROXY" npx hardhat run scripts/messages/unpauseMessageBridge.ts --network neoxDevnet
    echo "MessageBridge unpaused successfully!"
else
    echo "Warning: Could not extract MessageBridge address for unpausing"
fi

echo "Deployment and address extraction completed successfully!"

# Keep the container running briefly to ensure everything is captured
sleep 2
