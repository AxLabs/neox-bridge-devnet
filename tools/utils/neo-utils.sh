#!/usr/bin/env bash
# neo-utils.sh

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

# Function to validate 40-character hex format (addresses, token hashes, script hashes)
# Usage: validate_hex40_format <hex_value>
validate_hex40_format() {
    local hex_value="$1"

    if [ -z "$hex_value" ]; then
        echo "Error: Hex value parameter is required"
        return 1
    fi

    if ! [[ "$hex_value" =~ ^0x[a-fA-F0-9]{40}$ ]]; then
        echo "Invalid hex format (expected 0x + 40 hex chars): $hex_value"
        return 1
    fi

    return 0
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

# Function to read deployer address from wallet JSON
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

    # Extract address from JSON
    local address
    address="0x$(jq -r .address "$wallet_json")"
    if [ -z "$address" ] || [ "$address" == "0x" ]; then
        echo "Could not extract wallet address from $wallet_json"
        return 1
    fi

    # Convert to lowercase
    address=$(echo "$address" | tr '[:upper:]' '[:lower:]')

    # Validate address format
    validate_hex40_format "$address"

    echo "$address"
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
