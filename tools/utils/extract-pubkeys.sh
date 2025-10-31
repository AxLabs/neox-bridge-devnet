#!/bin/bash

# Script to extract public keys from NEO N3 wallet JSON files
# Usage: ./extract-pubkeys.sh <wallet-directory>

WALLET_DIR="${1:-/n3-wallets}"

if [ ! -d "$WALLET_DIR" ]; then
    echo "Error: Wallet directory $WALLET_DIR not found" >&2
    exit 1
fi

# Function to extract public key from wallet JSON
extract_pubkey() {
    local wallet_file="$1"
    local wallet_name="$2"

    if [ ! -f "$wallet_file" ]; then
        echo "Warning: Wallet file $wallet_file not found" >&2
        return
    fi

    # Extract the contract script and decode the public key
    local script=""
    # Pure bash JSON parsing - extract script value
    # Read the entire file content to handle multi-line JSON
    local json_content
    json_content=$(cat "$wallet_file")

    # Look for the script field in the JSON content
    if [[ "$json_content" == *'"script"'* ]]; then
        # Extract everything after "script": (with or without spaces)
        local after_script="${json_content#*\"script\"}"
        # Remove everything up to the opening quote
        local after_colon="${after_script#*:}"
        # Remove leading whitespace and quotes
        after_colon="${after_colon#"${after_colon%%[![:space:]]*}"}" # remove leading whitespace
        after_colon="${after_colon#\"}" # remove opening quote
        # Extract everything before the closing quote
        script="${after_colon%%\"*}"
    fi

    if [ -z "$script" ] || [ "$script" = "null" ]; then
        echo "Warning: No contract script found in $wallet_file" >&2
        return
    fi

    # Decode base64 script and extract public key (33 bytes after the PUSH33 opcode 0x0C21)
    # The script format is: 0x0C21 + 33_byte_pubkey + 0x41 + verification_script
    local hex_script
    # Use od instead of xxd for better compatibility
    hex_script=$(echo "$script" | base64 -d | od -An -tx1 | tr -d ' \n')
    local pubkey
    # Remove the 0c21 prefix and everything after the 66-character public key
    local temp="${hex_script#0c21}"
    pubkey="${temp:0:66}"

    if [ ${#pubkey} -eq 66 ]; then
        # Export the variable directly
        export "ROLE_${wallet_name}_PUBLIC_KEY=$pubkey"
        echo "export ROLE_${wallet_name}_PUBLIC_KEY=$pubkey"
    else
        echo "Warning: Invalid public key extraction for $wallet_name. Script: $hex_script" >&2
    fi
}

# Send informational messages to stderr so they don't interfere with eval
echo "# Public keys extracted from NEO N3 wallet files" >&2
echo "# Generated on $(date)" >&2
echo "" >&2

# Extract public keys from each wallet
extract_pubkey "$WALLET_DIR/validator01.json" "VALIDATOR_01"
extract_pubkey "$WALLET_DIR/validator02.json" "VALIDATOR_02"
