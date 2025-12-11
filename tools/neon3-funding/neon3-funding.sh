#!/usr/bin/env bash

# Load utility functions from container full path
source "/tools/utils/neo-utils.sh"

# NEO N3 Funding Script
# This script opens a wallet, checks GAS and NEO balances, sends tokens to addresses,
# and waits for the transactions to be confirmed

check_rpc_url() {
    # Set default RPC URL if not provided
    if [ -z "$N3_JSON_RPC" ]; then
        echo "N3_JSON_RPC environment variable not found, using default value"
        N3_JSON_RPC="http://localhost:40332"
        echo "Using default RPC URL: $N3_JSON_RPC"
    fi
}

check_token_hashes() {
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

    # Set default NEO token hash if not provided
    if [ -z "$NEO_TOKEN_HASH" ]; then
        echo "NEO_TOKEN_HASH environment variable not found, using default value"
        NEO_TOKEN_HASH="0xef4073a0f2b305a38ec4050e4d3d28bc40ea63f5"
        echo "Using default NEO token hash: $NEO_TOKEN_HASH"
    else
        # Validate user-provided token hash format
        if ! validate_hex40_format "$NEO_TOKEN_HASH"; then
            echo "Error: NEO_TOKEN_HASH format is invalid: $NEO_TOKEN_HASH"
            exit 1
        fi
    fi
}

check_required_params() {
    # Check if required parameters are provided
    if [ $# -lt 2 ]; then
        echo "Error: Both address and gas_amount parameters are required"
        echo "Usage: $0 <address_to_fund> <gas_amount_to_fund> [neo_amount_to_fund]"
        echo "Example: $0 NfU6xJ3k7zL4vM8nQ9wE2rT5yI1oP6aS7dF 10000 10"
        exit 1
    fi

    # Validate GAS amount format
    if ! [[ "$2" =~ ^[0-9]+$ ]]; then
        echo "Error: GAS amount must be a number: $2"
        exit 1
    fi

    # Validate NEO amount format if provided
    if [ $# -ge 3 ] && ! [[ "$3" =~ ^[0-9]+$ ]]; then
        echo "Error: NEO amount must be a whole number (integer): $3"
        exit 1
    fi
}

open_wallet() {
    echo "Opening wallet..." >&2
    local response
    response=$(curl -s -X POST "$N3_JSON_RPC" \
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
    response=$(curl -s -X POST "$N3_JSON_RPC" \
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

get_neo_balance() {
    local address="$1"
    echo "Checking NEO balance for address: $address" >&2
    local response
    response=$(curl -s -X POST "$N3_JSON_RPC" \
        -H "Content-Type: application/json" \
        -d "{
            \"jsonrpc\": \"2.0\",
            \"method\": \"getnep17balances\",
            \"params\": [\"$address\"],
            \"id\": 2
        }")
    local balance
    balance=$(echo "$response" | jq -r --arg hash "$NEO_TOKEN_HASH" '.result.balance[] | select(.assethash == $hash) | .amount // "0"')
    if [ -z "$balance" ] || [ "$balance" = "null" ]; then
        balance="0"
    fi
    echo "Current NEO balance: $balance" >&2
    echo "$balance"
}

check_and_send_gas_transaction() {
    local address="$1"
    local amount="$2"
    local gas_balance
    gas_balance=$(get_gas_balance "$address" 2>/dev/null)
    if [[ "$gas_balance" =~ ^[0-9]+$ ]] && [ "$gas_balance" -ge 10000000000 ]; then
        echo "GAS balance is greater than or equal to 100_00000000 ($gas_balance), skipping GAS transfer for $address" >&2
        echo "SKIP"
        return
    fi
    echo "GAS balance is less than 100_00000000 ($gas_balance), sending $amount GAS to $address" >&2
    send_gas_transaction "$address" "$amount"
}

check_and_send_neo_transaction() {
    local address="$1"
    local amount="$2"
    echo "   Debug: check_and_send_neo_transaction called with address='$address', amount='$amount'" >&2

    # Validate that amount is a valid integer
    if ! [[ "$amount" =~ ^[0-9]+$ ]]; then
        echo "   Error: Invalid NEO amount format: '$amount'" >&2
        echo "FAILED"
        return
    fi

    local neo_balance
    neo_balance=$(get_neo_balance "$address" 2>/dev/null)
    if [[ "$neo_balance" =~ ^[0-9]+$ ]] && [ "$neo_balance" -ge 10 ]; then
        echo "NEO balance is greater than or equal to 10 ($neo_balance), skipping NEO transfer for $address" >&2
        echo "SKIP"
        return
    fi
    echo "NEO balance is less than 10 ($neo_balance), sending $amount NEO to $address" >&2
    send_neo_transaction "$address" "$amount"
}

send_gas_transaction() {
    local address="$1"
    local amount="$2"
    echo "   Sending transaction to $address..." >&2
    local response
    response=$(curl -s -X POST "$N3_JSON_RPC" \
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

send_neo_transaction() {
    local address="$1"
    local amount="$2"

    # Validate that amount is a valid integer
    if ! [[ "$amount" =~ ^[0-9]+$ ]]; then
        echo "   Error: NEO amount must be a whole number (integer): $amount" >&2
        echo "FAILED"
        return
    fi

    echo "   Sending NEO transaction to $address (amount: $amount)..." >&2

    # Debug: show the exact JSON being sent
    local json_payload="{
        \"jsonrpc\": \"2.0\",
        \"method\": \"sendtoaddress\",
        \"params\": [\"$NEO_TOKEN_HASH\", \"$address\", $amount],
        \"id\": 3
    }"
    echo "   Debug: JSON payload: $json_payload" >&2

    local response
    response=$(curl -s -X POST "$N3_JSON_RPC" \
        -H "Content-Type: application/json" \
        -d "$json_payload")

    local tx_hash
    tx_hash=$(echo "$response" | jq -r '.result.hash // empty')
    if [ -n "$tx_hash" ]; then
        echo "   NEO transaction sent! Hash: $tx_hash" >&2
        echo "$tx_hash"
    else
        echo "   Error: NEO transaction failed" >&2
        echo "   Response: $response" >&2
        echo "FAILED"
    fi
}

verify_gas_transaction() {
    local tx_hash="$1"
    local address="$2"
    echo "   Verifying GAS transaction $tx_hash for $address..."
    wait_for_confirmation "$tx_hash"
    local gas_balance
    gas_balance=$(get_gas_balance "$address")
    echo "   New GAS balance for $address: $gas_balance"
}

verify_neo_transaction() {
    local tx_hash="$1"
    local address="$2"
    echo "   Verifying NEO transaction $tx_hash for $address..."
    wait_for_confirmation "$tx_hash"
    local neo_balance
    neo_balance=$(get_neo_balance "$address")
    echo "   New NEO balance for $address: $neo_balance"
}

wait_for_confirmation() {
    local tx_hash="$1"
    echo "Waiting for transaction confirmation..."
    while true; do
        local response
        response=$(curl -s -X POST "$N3_JSON_RPC" \
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
    local gas_amount="$1"
    local neo_amount="${2:-10}"  # Default to 10 NEO if not specified
    echo "Funding all addresses in wallet files in $wallets_dir with $gas_amount GAS and $neo_amount NEO..."
    echo "Debug: fund_all_wallets called with gas_amount='$gas_amount', neo_amount='$neo_amount'" >&2

    # Arrays to store pending transactions
    declare -a pending_gas_txs=()
    declare -a pending_neo_txs=()
    declare -a pending_gas_addresses=()
    declare -a pending_neo_addresses=()
    local total_addresses=0
    local skipped_gas_count=0
    local skipped_neo_count=0
    local failed_to_send_gas=0
    local failed_to_send_neo=0

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

                # Send GAS
                local gas_result
                gas_result=$(check_and_send_gas_transaction "$address" "$gas_amount")
                if [ "$gas_result" = "SKIP" ]; then
                    skipped_gas_count=$((skipped_gas_count + 1))
                elif [ "$gas_result" = "FAILED" ]; then
                    failed_to_send_gas=$((failed_to_send_gas + 1))
                else
                    pending_gas_txs+=("$gas_result")
                    pending_gas_addresses+=("$address")
                fi

                # Send NEO
                local neo_result
                neo_result=$(check_and_send_neo_transaction "$address" "$neo_amount")
                if [ "$neo_result" = "SKIP" ]; then
                    skipped_neo_count=$((skipped_neo_count + 1))
                elif [ "$neo_result" = "FAILED" ]; then
                    failed_to_send_neo=$((failed_to_send_neo + 1))
                else
                    pending_neo_txs+=("$neo_result")
                    pending_neo_addresses+=("$address")
                fi

                # Small delay between sends
                sleep 0.5
            fi
        done
    done

    echo ""
    echo "Phase 1 Summary:"
    echo "   Total addresses processed: $total_addresses"
    echo "   GAS transactions sent: ${#pending_gas_txs[@]}"
    echo "   NEO transactions sent: ${#pending_neo_txs[@]}"
    echo "   Addresses skipped (already funded with GAS): $skipped_gas_count"
    echo "   Addresses skipped (already funded with NEO): $skipped_neo_count"
    echo "   Failed to send GAS: $failed_to_send_gas"
    echo "   Failed to send NEO: $failed_to_send_neo"

    # Phase 2: Verify all pending GAS transactions
    if [ ${#pending_gas_txs[@]} -gt 0 ]; then
        echo ""
        echo "Phase 2a: Verifying GAS transaction confirmations..."
        for i in "${!pending_gas_txs[@]}"; do
            local tx_hash="${pending_gas_txs[$i]}"
            local address="${pending_gas_addresses[$i]}"
            echo ""
            echo "[$((i + 1))/${#pending_gas_txs[@]}] Verifying GAS for $address (tx: $tx_hash)..."
            verify_gas_transaction "$tx_hash" "$address"
        done
    fi

    # Phase 3: Verify all pending NEO transactions
    if [ ${#pending_neo_txs[@]} -gt 0 ]; then
        echo ""
        echo "Phase 2b: Verifying NEO transaction confirmations..."
        for i in "${!pending_neo_txs[@]}"; do
            local tx_hash="${pending_neo_txs[$i]}"
            local address="${pending_neo_addresses[$i]}"
            echo ""
            echo "[$((i + 1))/${#pending_neo_txs[@]}] Verifying NEO for $address (tx: $tx_hash)..."
            verify_neo_transaction "$tx_hash" "$address"
        done
    fi

    echo ""
    echo "All wallet addresses processing completed."
}

set -e  # Exit on any error

# Call sanity check functions
check_rpc_url
check_token_hashes
check_required_params "$@"

ADDRESS_TO_FUND="$1"
GAS_AMOUNT_TO_FUND="$2"
NEO_AMOUNT_TO_FUND="${3:-10}"  # Default to 10 NEO if not specified

# Validate NEO amount is an integer
if ! [[ "$NEO_AMOUNT_TO_FUND" =~ ^[0-9]+$ ]]; then
    echo "Error: NEO amount must be a whole number (integer): $NEO_AMOUNT_TO_FUND"
    exit 1
fi

echo "Configuration:"
echo "  Address to fund: $ADDRESS_TO_FUND"
echo "  GAS amount: $GAS_AMOUNT_TO_FUND"
echo "  NEO amount: $NEO_AMOUNT_TO_FUND"

wait_for_node "$N3_JSON_RPC"

# Main logic
open_wallet
fund_all_wallets "$GAS_AMOUNT_TO_FUND" "$NEO_AMOUNT_TO_FUND"

# Fund the specific address using two-phase approach
echo ""
echo "Funding specific address: $ADDRESS_TO_FUND with $GAS_AMOUNT_TO_FUND GAS and $NEO_AMOUNT_TO_FUND NEO..."

# Fund GAS
gas_result=$(check_and_send_gas_transaction "$ADDRESS_TO_FUND" "$GAS_AMOUNT_TO_FUND")
if [ "$gas_result" = "SKIP" ]; then
    echo "Address $ADDRESS_TO_FUND already has sufficient GAS balance"
elif [ "$gas_result" = "FAILED" ]; then
    echo "Failed to send GAS transaction to $ADDRESS_TO_FUND"
else
    echo "Verifying GAS transaction for $ADDRESS_TO_FUND..."
    verify_gas_transaction "$gas_result" "$ADDRESS_TO_FUND"
fi

# Fund NEO
neo_result=$(check_and_send_neo_transaction "$ADDRESS_TO_FUND" "$NEO_AMOUNT_TO_FUND")
if [ "$neo_result" = "SKIP" ]; then
    echo "Address $ADDRESS_TO_FUND already has sufficient NEO balance"
elif [ "$neo_result" = "FAILED" ]; then
    echo "Failed to send NEO transaction to $ADDRESS_TO_FUND"
else
    echo "Verifying NEO transaction for $ADDRESS_TO_FUND..."
    verify_neo_transaction "$neo_result" "$ADDRESS_TO_FUND"
fi

echo "Script completed successfully"
