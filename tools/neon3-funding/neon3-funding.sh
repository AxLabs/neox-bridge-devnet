#!/usr/bin/env bash

# NEO N3 Funding Script
# This script opens a wallet, checks GAS balance, sends GAS to an address, 
# and waits for the transaction to be confirmed

check_rpc_url() {
    # Set default RPC URL if not provided
    if [ -z "$NEON3_RPC_URL" ]; then
        echo "NEON3_RPC_URL environment variable not found, using default value"
        NEON3_RPC_URL="http://localhost:40332"
        echo "Using default RPC URL: $NEON3_RPC_URL"
    fi
}

check_gas_token_hash() {
    # Set default GAS token hash if not provided
    if [ -z "$GAS_TOKEN_HASH" ]; then
        echo "GAS_TOKEN_HASH environment variable not found, using default value"
        GAS_TOKEN_HASH="0xd2a4cff31913016155e38e474a2c06d08be276cf"
        echo "Using default GAS token hash: $GAS_TOKEN_HASH"
    fi
}

check_required_params() {
    # Check if required parameters are provided
    if [ $# -lt 2 ]; then
        echo "Error: Both address and amount parameters are required"
        echo "Usage: $0 <address_to_fund> <amount_to_fund>"
        echo "Example: $0 NfU6xJ3k7zL4vM8nQ9wE2rT5yI1oP6aS7dF 10000"
        exit 1
    fi
}

open_wallet() {
    echo "Opening wallet..." >&2
    local response
    response=$(curl -s -X POST "$NEON3_RPC_URL" \
        -H "Content-Type: application/json" \
        -d '{
            "jsonrpc": "2.0",
            "method": "openwallet",
            "params": ["/neo-cli/wallet.json", "neo"],
            "id": 1
        }')
    echo "Wallet response: $response" >&2
    local success
    success=$(echo "$response" | jq -r '.result')
    if [ "$success" != "true" ]; then
        echo "Error: Failed to open wallet"
        echo "Response: $response"
        exit 1
    fi
    echo "Wallet opened successfully" >&2
}

get_gas_balance() {
    local address="$1"
    echo "Checking GAS balance for address: $address" >&2
    local response
    response=$(curl -s -X POST "$NEON3_RPC_URL" \
        -H "Content-Type: application/json" \
        -d "{
            \"jsonrpc\": \"2.0\",
            \"method\": \"getnep17balances\",
            \"params\": [\"$address\"],
            \"id\": 2
        }")
    echo "Balance response: $response" >&2
    local balance
    balance=$(echo "$response" | jq -r --arg hash "$GAS_TOKEN_HASH" '.result.balance[] | select(.assethash == $hash) | .amount // "0"')
    if [ -z "$balance" ] || [ "$balance" = "null" ]; then
        balance="0"
    fi
    echo "Current GAS balance: $balance" >&2
    echo "$balance"
}

send_gas() {
    local address="$1"
    local amount="$2"
    local gas_balance
    gas_balance=$(get_gas_balance "$address")
    # Ensure gas_balance is a valid integer
    if [[ "$gas_balance" =~ ^[0-9]+$ ]] && [ "$gas_balance" -ge 10000000 ]; then
        echo "GAS balance is greater than or equal to 10000000 ($gas_balance), skipping GAS transfer for $address"
        return
    fi
    echo "GAS balance is 0, sending $amount GAS to $address"
    local response
    response=$(curl -s -X POST "$NEON3_RPC_URL" \
        -H "Content-Type: application/json" \
        -d "{
            \"jsonrpc\": \"2.0\",
            \"method\": \"sendtoaddress\",
            \"params\": [\"$GAS_TOKEN_HASH\", \"$address\", $amount],
            \"id\": 3
        }")
    echo "Send response: $response"
    local tx_hash
    tx_hash=$(echo "$response" | jq -r '.result.hash // empty')
    if [ -n "$tx_hash" ]; then
        echo "Transaction successful! Hash: $tx_hash"
        wait_for_confirmation "$tx_hash"
        gas_balance=$(get_gas_balance "$address")
        echo "New GAS balance for $address: $gas_balance"
    else
        echo "Error: Transaction failed"
        echo "Response: $response"
        exit 1
    fi
}

wait_for_confirmation() {
    local tx_hash="$1"
    echo "Waiting for transaction confirmation..."
    while true; do
        local response
        response=$(curl -s -X POST "$NEON3_RPC_URL" \
            -H "Content-Type: application/json" \
            -d "{
               \"jsonrpc\": \"2.0\",
               \"method\": \"getrawtransaction\",
               \"params\": [\"$tx_hash\", true],
               \"id\": 4
            }")
        local blockhash
        blockhash=$(echo "$response" | jq -r '.result.blockhash // empty')
        if [ -n "$blockhash" ] && [ "$blockhash" != "null" ]; then
            local confirmations
            confirmations=$(echo "$response" | jq -r '.result.confirmations // 0')
            echo "Transaction confirmed! Block hash: $blockhash"
            echo "Confirmations: $confirmations"
            break
        else
            echo "Transaction not yet confirmed, waiting 2 seconds..."
            sleep 2
        fi
    done
}

fund_all_wallets() {
    local wallets_dir
    wallets_dir="$(dirname "$0")/neon3-wallets"
    local amount="$1"
    echo "Funding all addresses in wallet files in $wallets_dir with $amount GAS..."
    for wallet_file in "$wallets_dir"/*.json; do
        if [ ! -f "$wallet_file" ]; then
            continue
        fi
        echo "Processing wallet file: $wallet_file"
        # Extract all addresses from the accounts array
        local addresses
        addresses=$(jq -r '.accounts[].address' "$wallet_file" 2>/dev/null)
        for address in $addresses; do
            if [ -n "$address" ]; then
                echo "Funding $address from $wallet_file with $amount GAS..."
                send_gas "$address" "$amount"
            fi
        done
    done
    echo "All wallet addresses funded."
}

wait_for_neo_node() {
    while ! curl -s "$NEON3_RPC_URL" > /dev/null; do
        echo "Waiting for NEO node RPC at $NEON3_RPC_URL..."
        sleep 2
    done
}

set -e  # Exit on any error

# Call sanity check functions
check_rpc_url
check_required_params "$@"

ADDRESS_TO_FUND="$1"
AMOUNT_TO_FUND="$2"

wait_for_neo_node

# Main logic
open_wallet
fund_all_wallets "$AMOUNT_TO_FUND"

send_gas "$ADDRESS_TO_FUND" "$AMOUNT_TO_FUND"

echo "Script completed successfully"
