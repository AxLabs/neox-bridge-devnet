#!/usr/bin/env bash

# Load utility functions from container full path
source "/tools/utils/neo-utils.sh"

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
    else
        # Validate user-provided token hash format
        if ! validate_hex40_format "$GAS_TOKEN_HASH"; then
            echo "Error: GAS_TOKEN_HASH format is invalid: $GAS_TOKEN_HASH"
            exit 1
        fi
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
    local balance
    balance=$(echo "$response" | jq -r --arg hash "$GAS_TOKEN_HASH" '.result.balance[] | select(.assethash == $hash) | .amount // "0"')
    if [ -z "$balance" ] || [ "$balance" = "null" ]; then
        balance="0"
    fi
    echo "Current GAS balance: $balance" >&2
    echo "$balance"
}

check_and_send_gas_transaction() {
    local address="$1"
    local amount="$2"
    local gas_balance
    gas_balance=$(get_gas_balance "$address" 2>/dev/null)
    # Ensure gas_balance is a valid integer
    if [[ "$gas_balance" =~ ^[0-9]+$ ]] && [ "$gas_balance" -ge 10000000000 ]; then
        echo "GAS balance is greater than or equal to 100_00000000 ($gas_balance), skipping GAS transfer for $address" >&2
        echo "SKIP"
        return
    fi
    echo "GAS balance is less than 100_00000000 ($gas_balance), sending $amount GAS to $address" >&2
    send_gas_transaction "$address" "$amount"
}

send_gas_transaction() {
    local address="$1"
    local amount="$2"
    echo "   Sending transaction to $address..." >&2
    local response
    response=$(curl -s -X POST "$NEON3_RPC_URL" \
        -H "Content-Type: application/json" \
        -d "{
            \"jsonrpc\": \"2.0\",
            \"method\": \"sendtoaddress\",
            \"params\": [\"$GAS_TOKEN_HASH\", \"$address\", $amount],
            \"id\": 3
        }")
    local tx_hash
    tx_hash=$(echo "$response" | jq -r '.result.hash // empty')
    if [ -n "$tx_hash" ]; then
        echo "   Transaction sent! Hash: $tx_hash" >&2
        echo "$tx_hash"
    else
        echo "   Error: Transaction failed" >&2
        echo "   Response: $response" >&2
        echo "FAILED"
    fi
}

verify_gas_transaction() {
    local tx_hash="$1"
    local address="$2"
    echo "   Verifying transaction $tx_hash for $address..."
    wait_for_confirmation "$tx_hash"
    local gas_balance
    gas_balance=$(get_gas_balance "$address")
    echo "   New GAS balance for $address: $gas_balance"
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

    # Arrays to store pending transactions
    declare -a pending_txs=()
    declare -a pending_addresses=()
    local total_addresses=0
    local skipped_count=0
    local failed_to_send=0

    # Phase 1: Check balances and send all transactions
    echo ""
    echo "Phase 1: Checking balances and sending transactions..."
    for wallet_file in "$wallets_dir"/*.json; do
        if [ ! -f "$wallet_file" ]; then
            continue
        fi
        echo ""
        echo "Processing wallet file: $wallet_file"
        # Extract all addresses from the accounts array
        local addresses
        addresses=$(jq -r '.accounts[].address' "$wallet_file" 2>/dev/null)
        for address in $addresses; do
            if [ -n "$address" ]; then
                total_addresses=$((total_addresses + 1))
                echo "[$total_addresses] Processing $address from $(basename "$wallet_file")..."
                local result
                result=$(check_and_send_gas_transaction "$address" "$amount")
                if [ "$result" = "SKIP" ]; then
                    skipped_count=$((skipped_count + 1))
                elif [ "$result" = "FAILED" ]; then
                    failed_to_send=$((failed_to_send + 1))
                else
                    # result contains the transaction hash
                    pending_txs+=("$result")
                    pending_addresses+=("$address")
                fi
                # Small delay between sends
                sleep 0.5
            fi
        done
    done

    echo ""
    echo "Phase 1 Summary:"
    echo "   Total addresses processed: $total_addresses"
    echo "   Transactions sent: ${#pending_txs[@]}"
    echo "   Addresses skipped (already funded): $skipped_count"
    echo "   Failed to send: $failed_to_send"

    # Phase 2: Verify all pending transactions
    if [ ${#pending_txs[@]} -gt 0 ]; then
        echo ""
        echo "Phase 2: Verifying transaction confirmations..."
        for i in "${!pending_txs[@]}"; do
            local tx_hash="${pending_txs[$i]}"
            local address="${pending_addresses[$i]}"
            echo ""
            echo "[$((i + 1))/${#pending_txs[@]}] Verifying $address (tx: $tx_hash)..."
            verify_gas_transaction "$tx_hash" "$address"
        done
    fi

    echo ""
    echo "All wallet addresses processing completed."
}

set -e  # Exit on any error

# Call sanity check functions
check_rpc_url
check_gas_token_hash
check_required_params "$@"

ADDRESS_TO_FUND="$1"
AMOUNT_TO_FUND="$2"

wait_for_node "$NEON3_RPC_URL"

# Main logic
open_wallet
fund_all_wallets "$AMOUNT_TO_FUND"

# Fund the specific address using two-phase approach
echo ""
echo "Funding specific address: $ADDRESS_TO_FUND with $AMOUNT_TO_FUND GAS..."
result=$(check_and_send_gas_transaction "$ADDRESS_TO_FUND" "$AMOUNT_TO_FUND")
if [ "$result" = "SKIP" ]; then
    echo "Address $ADDRESS_TO_FUND already has sufficient GAS balance"
elif [ "$result" = "FAILED" ]; then
    echo "Failed to send transaction to $ADDRESS_TO_FUND"
    exit 1
else
    echo "Verifying transaction for $ADDRESS_TO_FUND..."
    verify_gas_transaction "$result" "$ADDRESS_TO_FUND"
fi

echo "Script completed successfully"
