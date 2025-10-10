#!/bin/bash

# Wrapper script for deploying message bridge and extracting addresses
set -e

LOG_FILE="/tmp/deploy-neox-message-bridge.log"
OUTPUT_FILE="/tools/addresses/neox-addresses.json"

# Function to extract a specific contract address from the log
extract_contract_address() {
    local contract_name="$1"
    grep -i "$contract_name" "$LOG_FILE" | awk -F': ' '{print $2}' | tr -d ' ' | head -1
}

# Function to extract addresses
extract_addresses() {
    echo "Extracting addresses from deployment log..."

    if [ ! -f "$LOG_FILE" ]; then
        echo "Log file not found: $LOG_FILE"
        return 1
    fi

    # Create the output directory if it doesn't exist
    mkdir -p "$(dirname "$OUTPUT_FILE")"

    # Extract addresses using the helper function
    BRIDGE_MANAGEMENT_PROXY=$(extract_contract_address "Bridge Management deployed at:")
    BRIDGE_MANAGEMENT_LOGIC=$(extract_contract_address "Management Logic Address:")
    MESSAGE_BRIDGE_PROXY=$(extract_contract_address "Message Bridge Proxy deployed at:")
    MESSAGE_BRIDGE_LOGIC=$(extract_contract_address "Message Bridge Logic deployed at:")
    EXECUTION_MANAGER=$(extract_contract_address "Execution Manager deployed at:")

    # Create JSON output
    cat > "$OUTPUT_FILE" <<EOF
{
  "bridgeManagementProxy": "${BRIDGE_MANAGEMENT_PROXY}",
  "bridgeManagementLogic": "${BRIDGE_MANAGEMENT_LOGIC}",
  "messageBridgeProxy": "${MESSAGE_BRIDGE_PROXY}",
  "messageBridgeLogic": "${MESSAGE_BRIDGE_LOGIC}",
  "executionManager": "${EXECUTION_MANAGER}"
}
EOF

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
trap cleanup SIGTERM SIGINT SIGQUIT EXIT

echo "Starting message bridge deployment..."

# Run the deployment process
rm -rf /app/.openzeppelin
bash /tools/deploy/wait-for-neox-funding.sh
npm install
npx hardhat vars set NEOX_DEVNET_RPC_URL "$NEOX_RPC_URL"
npx hardhat run scripts/deployMessageBridge.ts --network neoxDevnet | tee "$LOG_FILE"

# Extract addresses after successful deployment
extract_addresses

echo "Deployment and address extraction completed successfully!"

# Keep the container running briefly to ensure everything is captured
sleep 2
