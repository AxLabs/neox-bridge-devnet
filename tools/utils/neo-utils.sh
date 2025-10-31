#!/usr/bin/env bash
# neo-utils.sh

# Utility function to run a Java main class using Gradle
# Usage: run_gradle_class <main_class>
run_gradle_class() {
  local main_class="$1"

  sh gradlew -q -PmainClass="$main_class" run \
    2> >(grep -vE "SLF4J:|Note: (Some input files use unchecked|Recompile with -Xlint:unchecked)")
}

# Utility functions for NEO and Ethereum interactions
# Usage: wait_for_node <rpc_url>
wait_for_node() {
    local rpc_url="$1"

    if [ -z "$rpc_url" ]; then
        echo "Error: RPC URL parameter is required"
        return 1
    fi

    while ! curl -s "$rpc_url" > /dev/null; do
        echo "Waiting for node RPC at $rpc_url..."
        sleep 2
    done
}

# Function to get NEO N3 GAS balance in decimal format
get_neo3_balance() {
    local node_url="$1"
    local address="$2"
    local response
    response=$(curl -s -X POST "$node_url" \
        -H "Content-Type: application/json" \
        -d "{
            \"jsonrpc\": \"2.0\",
            \"method\": \"getnep17balances\",
            \"params\": [\"$address\"],
            \"id\": 2
        }")

    # Extract GAS balance (using standard GAS token hash)
    local GAS_TOKEN_HASH="${GAS_TOKEN_HASH:-0xd2a4cff31913016155e38e474a2c06d08be276cf}"

    # Check if the response has a valid result and balance array
    if echo "$response" | jq -e '.result.balance' >/dev/null 2>&1; then
        local balance
        balance=$(echo "$response" | jq -r --arg hash "$GAS_TOKEN_HASH" '.result.balance[] | select(.assethash == $hash) | .amount // "0"')
    else
        local balance="0"
    fi

    if [[ "$balance" == "null" || -z "$balance" ]]; then
        echo "0"
    else
        echo "$balance"
    fi
}

# Function to get Ethereum balance in decimal format (wei)
get_ethereum_balance() {
    local node_url="$1"
    local address="$2"
    local balance_hex
    balance_hex=$(curl -s -X POST --data '{"jsonrpc":"2.0","method":"eth_getBalance","params":["'"$address"'", "latest"],"id":1}' -H "Content-Type: application/json" "$node_url" | jq -r .result)

    if [[ "$balance_hex" == "null" || -z "$balance_hex" ]]; then
        echo "0"
    else
        local balance_dec=$((16#${balance_hex:2}))
        echo "$balance_dec"
    fi
}

# Function to validate 40-character hex format (addresses, token hashes, script hashes)
# Accepts both formats: with 0x prefix or without (40 hex characters)
# Usage: validate_hex40_format <hex_value>
validate_hex40_format() {
    local hex_value="$1"

    if [ -z "$hex_value" ]; then
        echo "Error: Hex value parameter is required"
        return 1
    fi

    # Check for 0x prefix format (42 characters total)
    if [[ "$hex_value" =~ ^0x[a-fA-F0-9]{40}$ ]]; then
        return 0
    fi

    # Check for format without 0x prefix (40 characters total)
    if [[ "$hex_value" =~ ^[a-fA-F0-9]{40}$ ]]; then
        return 0
    fi

    echo "Invalid hex format (expected 40 hex chars with or without 0x prefix): $hex_value"
    return 1
}

# Function to extract a specific contract address from the log. Address validation is performed.
# Usage: extract_contract_address_from_log <log_file> <matching_string>
extract_contract_address_from_log() {
    local log_file="$1"
    local matching_string="$2"

    if [ -z "$log_file" ] || [ -z "$matching_string" ]; then
        echo "Error: LOG_FILE and matching_string parameters are required"
        return 1
    fi

    if [ ! -f "$log_file" ]; then
        echo "Error: Log file does not exist: $log_file"
        return 1
    fi

    local extracted_address
    local matching_lines

    if ! matching_lines=$(grep -i "$matching_string" "$log_file" 2>/dev/null) || [ -z "$matching_lines" ]; then
        echo "Error: No lines match the pattern '$matching_string' in $log_file"
        return 1
    fi

    extracted_address=$(echo "$matching_lines" | grep -oE '0x[a-fA-F0-9]{40}' | head -1)

    if [ -z "$extracted_address" ]; then
        echo "Error: No address found for pattern '$matching_string' in $log_file"
        return 1
    fi

    if ! validate_hex40_format "$extracted_address"; then
        return 1
    fi

    echo "$extracted_address"
}

# Function to read address from wallet JSON (supports both NEO N3 and Ethereum wallet formats)
# Usage: read_wallet_address <wallet_json_file>
read_wallet_address() {
    local wallet_json="$1"

    if [ -z "$wallet_json" ]; then
        echo "Error: Wallet JSON file parameter is required"
        return 1
    fi

    # Check if wallet file exists
    if [ ! -f "$wallet_json" ]; then
        echo "Wallet file not found: $wallet_json"
        return 1
    fi

    local address=""

    # Try to extract address using different wallet formats
    # First try Ethereum wallet format (direct address field)
    address=$(jq -r '.address // empty' "$wallet_json" 2>/dev/null)

    # If not found, try NEO N3 wallet format (accounts[0].address)
    if [ -z "$address" ]; then
        address=$(jq -r '.accounts[0].address // empty' "$wallet_json" 2>/dev/null)
    fi

    if [ -z "$address" ]; then
        echo "Could not extract wallet address from $wallet_json"
        return 1
    fi

    # Handle different address formats
    if [[ "$address" =~ ^[A-Za-z0-9]{34}$ ]]; then
        # NEO N3 address (Base58 format) - return as-is
        echo "$address"
        return 0
    elif [[ "$address" =~ ^(0x)?[0-9a-fA-F]{40}$ ]]; then
        # Ethereum address (with or without 0x prefix)
        [[ "$address" != 0x* ]] && address="0x$address"
        address=$(echo "$address" | tr '[:upper:]' '[:lower:]')
        validate_hex40_format "$address" && echo "$address"
    else
        echo "Invalid address format: $address"
        return 1
    fi
}

# Function to create JSON output from key-value pairs
# Usage: output_to_json <output_file> <key1> <value1> <key2> <value2> ...
output_to_json() {
    local output_file="$1"
    shift  # Remove the first argument (output_file)

    if [ -z "$output_file" ]; then
        echo "Error: Output file parameter is required"
        return 1
    fi

    # Check if we have an even number of arguments (key-value pairs)
    if [ $(($# % 2)) -ne 0 ]; then
        echo "Error: Arguments must be in key-value pairs"
        return 1
    fi

    echo "Creating JSON output at: $output_file"

    # Create the output directory if it doesn't exist
    mkdir -p "$(dirname "$output_file")"

    # Start JSON object
    echo "{" > "$output_file"

    local first=true
    while [ $# -gt 1 ]; do
        local key="$1"
        local value="$2"
        shift 2

        # Skip empty values
        if [ -z "$value" ]; then
            echo "Warning: Empty value for key '$key', skipping..."
            continue
        fi

        # Add comma and newline if not the first entry
        if [ "$first" = false ]; then
            printf ",\n" >> "$output_file"
        fi
        first=false

        # Add key-value pair with proper formatting
        printf '  "%s": "%s"' "$key" "$value" >> "$output_file"
    done

    # Close JSON object
    printf "\n}\n" >> "$output_file"

    echo "JSON file created successfully: $output_file"
}

# Ensure a wallet file exists in the destination, copy from source if needed
# Usage: ensure_wallet_exists <source_dir> <dest_dir> <wallet_filename>
ensure_wallet_exists() {
    local source_dir="$1"
    local dest_dir="$2"
    local wallet_file="$3"
    local src_wallet="$source_dir/$wallet_file"
    local dest_wallet="$dest_dir/$wallet_file"

    mkdir -p "$dest_dir"
    if [[ -f "$dest_wallet" ]]; then
        print_info "Wallet already exists: $dest_wallet. Skipping copy."
        return 0
    fi
    if [[ ! -f "$src_wallet" ]]; then
        print_error "Required wallet not found in source: $src_wallet. Cannot continue."
        return 1
    fi
    cp "$src_wallet" "$dest_wallet"
    print_info "Copied wallet from $src_wallet to $dest_wallet."
    return 0
}
