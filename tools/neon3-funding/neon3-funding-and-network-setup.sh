#!/usr/bin/env bash

# Load color functions
source "/tools/utils/colors.sh"

# Load utility functions from container full path
source "/tools/utils/neo-utils.sh"

# NEO N3 Funding Script
# This script opens a wallet, checks GAS and NEO balances, sends tokens to addresses,
# and waits for the transactions to be confirmed

check_rpc_url() {
    # Set default RPC URL if not provided
    if [ -z "$N3_JSON_RPC" ]; then
        print_info "N3_JSON_RPC environment variable not found, using default value"
        N3_JSON_RPC="http://localhost:40332"
        print_info "Using default RPC URL: $N3_JSON_RPC"
    fi
}

check_token_hashes() {
    # Set default GAS token hash if not provided
    if [ -z "$GAS_TOKEN_HASH" ]; then
        print_info "GAS_TOKEN_HASH environment variable not found, using default value"
        GAS_TOKEN_HASH="0xd2a4cff31913016155e38e474a2c06d08be276cf"
        print_info "Using default GAS token hash: $GAS_TOKEN_HASH"
    else
        # Validate user-provided token hash format
        if ! validate_hex40_format "$GAS_TOKEN_HASH"; then
            print_error "GAS_TOKEN_HASH format is invalid: $GAS_TOKEN_HASH"
            exit 1
        fi
    fi

    # Set default NEO token hash if not provided
    if [ -z "$NEO_TOKEN_HASH" ]; then
        print_info "NEO_TOKEN_HASH environment variable not found, using default value"
        NEO_TOKEN_HASH="0xef4073a0f2b305a38ec4050e4d3d28bc40ea63f5"
        print_info "Using default NEO token hash: $NEO_TOKEN_HASH"
    else
        # Validate user-provided token hash format
        if ! validate_hex40_format "$NEO_TOKEN_HASH"; then
            print_error "NEO_TOKEN_HASH format is invalid: $NEO_TOKEN_HASH"
            exit 1
        fi
    fi
}

check_required_params() {
    # Check if required parameters are provided
    if [ $# -lt 2 ]; then
        print_error "Both address and gas_amount parameters are required"
        print_error "Usage: $0 <address_to_fund> <gas_amount_to_fund> [neo_amount_to_fund]"
        print_error "Example: $0 NfU6xJ3k7zL4vM8nQ9wE2rT5yI1oP6aS7dF 10000 10"
        exit 1
    fi

    # Validate GAS amount format
    if ! [[ "$2" =~ ^[0-9]+$ ]]; then
        print_error "GAS amount must be a number: $2"
        exit 1
    fi

    # Validate NEO amount format if provided
    if [ $# -ge 3 ] && ! [[ "$3" =~ ^[0-9]+$ ]]; then
        print_error "NEO amount must be a whole number (integer): $3"
        exit 1
    fi
}

open_wallet() {
    print_info "Opening wallet..."
    local response
    response=$(curl -s -X POST "$N3_JSON_RPC" \
        -H "Content-Type: application/json" \
        -d '{
            "jsonrpc": "2.0",
            "method": "openwallet",
            "params": ["/neo-cli/wallet.json", "neo"],
            "id": 1
        }')
    print_info "Wallet response: $response"
    local success
    success=$(echo "$response" | jq -r '.result')
    if [ "$success" != "true" ]; then
        print_error "Failed to open wallet"
        print_error "Response: $response"
        exit 1
    fi
    print_success "Wallet opened successfully"
}

get_gas_balance() {
    local address="$1"
    print_info "Checking GAS balance for address: $address"
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
    print_info "Current GAS balance: $balance"
    echo "$balance"
}

get_neo_balance() {
    local address="$1"
    print_info "Checking NEO balance for address: $address"
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
    print_info "Current NEO balance: $balance"
    echo "$balance"
}

check_and_send_gas_transaction() {
    local address="$1"
    local amount="$2"
    local gas_balance
    gas_balance=$(get_gas_balance "$address" 2>/dev/null)
    if [[ "$gas_balance" =~ ^[0-9]+$ ]] && [ "$gas_balance" -ge 10000000000 ]; then
        print_info "GAS balance is greater than or equal to 100_00000000 ($gas_balance), skipping GAS transfer for $address"
        echo "SKIP"
        return
    fi
    print_info "GAS balance is less than 100_00000000 ($gas_balance), sending $amount GAS to $address"
    send_gas_transaction "$address" "$amount"
}

check_and_send_neo_transaction() {
    local address="$1"
    local amount="$2"

    # Validate that amount is a valid integer
    if ! [[ "$amount" =~ ^[0-9]+$ ]]; then
        print_error "Invalid NEO amount format: '$amount'"
        echo "FAILED"
        return
    fi

    local neo_balance
    neo_balance=$(get_neo_balance "$address" 2>/dev/null)
    if [[ "$neo_balance" =~ ^[0-9]+$ ]] && [ "$neo_balance" -ge 10 ]; then
        print_info "NEO balance is greater than or equal to 10 ($neo_balance), skipping NEO transfer for $address"
        echo "SKIP"
        return
    fi
    print_info "NEO balance is less than 10 ($neo_balance), sending $amount NEO to $address"
    send_neo_transaction "$address" "$amount"
}

send_gas_transaction() {
    local address="$1"
    local amount="$2"
    print_info "Sending transaction to $address..."
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
        print_success "Transaction sent! Hash: $tx_hash"
        echo "$tx_hash"
    else
        print_error "Transaction failed\n\
        Response: $response" >&2
        echo "FAILED"
    fi
}

send_neo_transaction() {
    local address="$1"
    local amount="$2"

    # Validate that amount is a valid integer
    if ! [[ "$amount" =~ ^[0-9]+$ ]]; then
        print_error "NEO amount must be a whole number (integer): $amount"
        echo "FAILED"
        return
    fi

    print_info "Sending NEO transaction to $address (amount: $amount)..."

    local json_payload="{
        \"jsonrpc\": \"2.0\",
        \"method\": \"sendtoaddress\",
        \"params\": [\"$NEO_TOKEN_HASH\", \"$address\", $amount],
        \"id\": 3
    }"

    local response
    response=$(curl -s -X POST "$N3_JSON_RPC" \
        -H "Content-Type: application/json" \
        -d "$json_payload")

    local tx_hash
    tx_hash=$(echo "$response" | jq -r '.result.hash // empty')
    if [ -n "$tx_hash" ]; then
        print_success "NEO transaction sent! Hash: $tx_hash"
        echo "$tx_hash"
    else
        print_error "NEO transaction failed\n\
        Response: $response" >&2
        echo "FAILED"
    fi
}

verify_gas_transaction() {
    local tx_hash="$1"
    local address="$2"
    print_info "Verifying GAS transaction $tx_hash for $address..."
    wait_for_confirmation "$tx_hash"
    local gas_balance
    gas_balance=$(get_gas_balance "$address")
    print_info "New GAS balance for $address: $gas_balance"
}

verify_neo_transaction() {
    local tx_hash="$1"
    local address="$2"
    print_info "Verifying NEO transaction $tx_hash for $address..."
    wait_for_confirmation "$tx_hash"
    local neo_balance
    neo_balance=$(get_neo_balance "$address")
    print_info "New NEO balance for $address: $neo_balance"
}

wait_for_confirmation() {
    local tx_hash="$1"
    print_info "Waiting for transaction confirmation..."
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
            print_success "Transaction confirmed! Block hash: $blockhash"
            print_info "Confirmations: $confirmations"
            break
        else
            print_info "Transaction not yet confirmed, waiting 2 seconds..."
            sleep 2
        fi
    done
}

fund_all_wallets() {
    local wallets_dir
    wallets_dir="/tools/neon3-funding/neon3-wallets"
    local gas_amount="$1"
    local neo_amount="${2:-10}"  # Default to 10 NEO if not specified

    if [ ! -d "$wallets_dir" ]; then
        print_error "ERROR: Wallets directory does not exist: $wallets_dir"
        exit 1
    fi

    print_info "Funding all addresses in wallet files in $wallets_dir with $gas_amount GAS and $neo_amount NEO..."

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
    print_empty
    print_info "Phase 1: Checking balances and sending transactions..."

    for wallet_file in "$wallets_dir"/*.json; do
        if [ ! -f "$wallet_file" ]; then
            continue
        fi
        print_empty
        print_info "Processing wallet file: $wallet_file"
        # Extract all addresses from the accounts array
        local addresses
        addresses=$(jq -r '.accounts[].address' "$wallet_file" 2>/dev/null)
        local jq_exit_code=$?

        if [ $jq_exit_code -ne 0 ]; then
            print_error "ERROR: Failed to parse JSON from $wallet_file"
            continue
        fi

        if [ -z "$addresses" ]; then
            print_info "WARNING: No addresses found in $wallet_file"
            continue
        fi


        for address in $addresses; do
            if [ -n "$address" ]; then
                total_addresses=$((total_addresses + 1))
                print_info "[$total_addresses] Processing $address from $(basename "$wallet_file")..."

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

                sleep 0.8  # Small delay between GAS and NEO sends

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
                sleep 0.8
            fi
        done
    done

    print_empty
    print_info "Phase 1 Summary:\n\
       Total addresses processed: $total_addresses\n\
       GAS transactions sent: ${#pending_gas_txs[@]}\n\
       NEO transactions sent: ${#pending_neo_txs[@]}\n\
       Addresses skipped (already funded with GAS): $skipped_gas_count\n\
       Addresses skipped (already funded with NEO): $skipped_neo_count\n\
       Failed to send GAS: $failed_to_send_gas\n\
       Failed to send NEO: $failed_to_send_neo"
    print_separator

    print_info "Phase 2: Verifying GAS and NEO transaction confirmations..."
    # Phase 2a: Verify all pending GAS transactions
    if [ ${#pending_gas_txs[@]} -gt 0 ]; then
        for i in "${!pending_gas_txs[@]}"; do
            local tx_hash="${pending_gas_txs[$i]}"
            local address="${pending_gas_addresses[$i]}"
            print_empty
            print_info "[$((i + 1))/${#pending_gas_txs[@]}] Verifying GAS for $address (tx: $tx_hash)..."
            verify_gas_transaction "$tx_hash" "$address"
        done
    fi

    # Phase 2b: Verify all pending NEO transactions
    if [ ${#pending_neo_txs[@]} -gt 0 ]; then
        print_empty
        for i in "${!pending_neo_txs[@]}"; do
            local tx_hash="${pending_neo_txs[$i]}"
            local address="${pending_neo_addresses[$i]}"
            print_empty
            print_info "[$((i + 1))/${#pending_neo_txs[@]}] Verifying NEO for $address (tx: $tx_hash)..."
            verify_neo_transaction "$tx_hash" "$address"
        done
    fi
    print_success "All wallet addresses processing completed."
}

set_policy_parameters() {
    local storage_price="$1"
    local exec_fee_factor="$2"
    local fee_per_byte="$3"

    print_info "Setting PolicyContract parameters..."
    print_info "Required - Storage price: $storage_price, Execution fee factor: $exec_fee_factor, Fee per byte: $fee_per_byte"

    # Use neow3j to check and set policy parameters
    if command -v gradle >/dev/null 2>&1; then
        print_info "Using neow3j to check and set policy parameters..."
        generate_and_send_policy_transactions "$storage_price" "$exec_fee_factor" "$fee_per_byte"
    else
        print_error "Gradle not available - cannot check or set policy parameters"
        print_error "Policy parameters management requires neow3j/Java environment"
        exit 1
    fi
}

# Helper function to extract error messages from Java output
extract_error_message() {
    local java_output="$1"
    echo "$java_output" | grep "^ERROR_MESSAGE=" | cut -d'=' -f2-
}

# Helper function to show parameter changes
show_parameter_changes() {
    local java_output="$1"
    local current_storage_price="$2"
    local current_exec_factor="$3"
    local current_fee_per_byte="$4"
    local new_storage
    local new_exec
    local new_fee

    if echo "$java_output" | grep -q "^NEEDS_UPDATE_STORAGE_PRICE="; then
        new_storage=$(echo "$java_output" | grep "^NEEDS_UPDATE_STORAGE_PRICE=" | cut -d'=' -f2)
        print_info "Storage price: $current_storage_price -> $new_storage"
    fi
    if echo "$java_output" | grep -q "^NEEDS_UPDATE_EXEC_FEE_FACTOR="; then
        new_exec=$(echo "$java_output" | grep "^NEEDS_UPDATE_EXEC_FEE_FACTOR=" | cut -d'=' -f2)
        print_info "Execution fee factor: $current_exec_factor -> $new_exec"
    fi
    if echo "$java_output" | grep -q "^NEEDS_UPDATE_FEE_PER_BYTE="; then
        new_fee=$(echo "$java_output" | grep "^NEEDS_UPDATE_FEE_PER_BYTE=" | cut -d'=' -f2)
        print_info "Fee per byte: $current_fee_per_byte -> $new_fee"
    fi
}

# Helper function to handle policy status cases
handle_policy_status() {
    local policy_status="$1"
    local java_output="$2"
    local current_storage_price="$3"
    local current_exec_factor="$4"
    local current_fee_per_byte="$5"

    case "$policy_status" in
        "ALREADY_CORRECT")
            print_success "All policy parameters are already set to desired values"
            return
            ;;
        "READ_FAILED")
            print_error "Failed to read policy settings: $(extract_error_message "$java_output")"
            exit 1
            ;;
        "NEEDS_UPDATE")
            print_info "Policy parameters need to be updated"
            show_parameter_changes "$java_output" "$current_storage_price" "$current_exec_factor" "$current_fee_per_byte"
            print_error "Java utility indicated updates needed but didn't send transactions"
            print_error "This should not happen - check Java utility logic"
            exit 1
            ;;
        "TRANSACTIONS_SENT")
            print_success "Policy parameter transactions sent successfully by neow3j"
            print_info "Updated policy parameters: $java_output"
            print_info "Transaction hashes are available in the Java output above"
            return
            ;;
        "TRANSACTION_SEND_FAILED")
            print_error "Failed to send policy transactions: $(extract_error_message "$java_output")"
            exit 1
            ;;
        "COMMITTEE_AUTHORITY_REQUIRED")
            print_error "Policy changes require committee multisig authority"
            print_error "Current network uses single-node setup without proper committee multisig"
            print_error "Policy parameters cannot be changed - using current network values:"
            print_error "  Storage price: $current_storage_price (desired: $STORAGE_PRICE)"
            print_error "  Execution fee factor: $current_exec_factor (desired: $EXEC_FEE_FACTOR)"
            print_error "  Fee per byte: $current_fee_per_byte (desired: $FEE_PER_BYTE)"
            print_error "This configuration mismatch will cause deployment issues"
            exit 1
            ;;
        *)
            print_error "Unknown policy status: $policy_status"
            print_error "Java output:"
            echo "$java_output"
            exit 1
            ;;
    esac
}


generate_and_send_policy_transactions() {
    local storage_price="$1"
    local exec_fee_factor="$2"
    local fee_per_byte="$3"

    # Set environment variables for the Java utility
    export STORAGE_PRICE="$storage_price"
    export EXEC_FEE_FACTOR="$exec_fee_factor"
    export FEE_PER_BYTE="$fee_per_byte"

    # Verify wallet file exists (should be provided via environment variable)
    if [ -z "$WALLET_FILEPATH_DEPLOYER" ]; then
        print_error "WALLET_FILEPATH_DEPLOYER environment variable not set"
        exit 1
    fi

    if [ ! -f "$WALLET_FILEPATH_DEPLOYER" ]; then
        print_error "Wallet file not found: $WALLET_FILEPATH_DEPLOYER"
        exit 1
    fi

    # Navigate to the bridge-neo-contracts directory
    local neo_contracts_dir="/bridge-neo-contracts"
    if [ ! -d "$neo_contracts_dir" ]; then
        print_error "Neo contracts directory not found: $neo_contracts_dir"
        print_error "Cannot generate policy transactions without neow3j"
        exit 1
    fi

    print_info "Checking policy parameters using SetupNetworkSettings..."
    print_info "Using wallet: $WALLET_FILEPATH_DEPLOYER"
    print_info "N3_JSON_RPC: $N3_JSON_RPC"

    # Run the Java utility
    cd "$neo_contracts_dir"

    if [ ! -f "src/deploy/java/network/bane/scripts/setup/SetupNetworkSettings.java" ]; then
        print_error "SetupNetworkSettings.java not found"
        print_error "Cannot generate policy transactions"
        exit 1
    fi

    print_info "Running Java policy check and transaction generation..."
    local java_output
    java_output=$(./gradlew -q run -PmainClass=network.bane.scripts.setup.SetupNetworkSettings 2>&1)
    local gradle_exit_code=$?

    print_info "Java utility exit code: $gradle_exit_code"

    if [ $gradle_exit_code -ne 0 ]; then
        print_error "Java utility failed to run"
        print_error "Output:"
        echo "$java_output"

        # Check if it's a policy read failure
        if echo "$java_output" | grep -q "POLICY_STATUS=READ_FAILED"; then
            print_error "Failed to read current policy settings from Neo N3 node"
            print_error "This indicates a problem with the RPC connection or policy contract access"
        else
            print_error "Java utility execution failed"
        fi
        exit 1
    fi

    # Parse the Java output for current values and status
    local current_storage_price
    local current_exec_factor
    local current_fee_per_byte
    local policy_status

    current_storage_price=$(echo "$java_output" | grep "^CURRENT_STORAGE_PRICE=" | cut -d'=' -f2)
    current_exec_factor=$(echo "$java_output" | grep "^CURRENT_EXEC_FEE_FACTOR=" | cut -d'=' -f2)
    current_fee_per_byte=$(echo "$java_output" | grep "^CURRENT_FEE_PER_BYTE=" | cut -d'=' -f2)
    policy_status=$(echo "$java_output" | grep "^POLICY_STATUS=" | cut -d'=' -f2)

    print_info "Current policy settings from neow3j:"
    print_info "  Storage price: $current_storage_price"
    print_info "  Execution fee factor: $current_exec_factor"
    print_info "  Fee per byte: $current_fee_per_byte"
    print_info "  Status: $policy_status"

    handle_policy_status "$policy_status" "$java_output" "$current_storage_price" "$current_exec_factor" "$current_fee_per_byte"

    print_success "Policy parameter check completed"
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
    print_error "NEO amount must be a whole number (integer): $NEO_AMOUNT_TO_FUND"
    exit 1
fi

print_info "Configuration:\n\
       Address to fund: $ADDRESS_TO_FUND\n\
       GAS amount: $GAS_AMOUNT_TO_FUND\n\
       NEO amount: $NEO_AMOUNT_TO_FUND"

wait_for_node "$N3_JSON_RPC"

# Main logic
print_separator
open_wallet
print_separator
set_policy_parameters "$STORAGE_PRICE" "$EXEC_FEE_FACTOR" "$FEE_PER_BYTE"
print_separator
fund_all_wallets "$GAS_AMOUNT_TO_FUND" "$NEO_AMOUNT_TO_FUND"

# Fund the specific address using two-phase approach
print_separator
print_info "Funding specific address: $ADDRESS_TO_FUND with $GAS_AMOUNT_TO_FUND GAS and $NEO_AMOUNT_TO_FUND NEO..."

# Fund GAS
gas_result=$(check_and_send_gas_transaction "$ADDRESS_TO_FUND" "$GAS_AMOUNT_TO_FUND")
if [ "$gas_result" = "SKIP" ]; then
    print_info "Address $ADDRESS_TO_FUND already has sufficient GAS balance"
elif [ "$gas_result" = "FAILED" ]; then
    print_error "Failed to send GAS transaction to $ADDRESS_TO_FUND"
else
    print_info "Verifying GAS transaction for $ADDRESS_TO_FUND..."
    verify_gas_transaction "$gas_result" "$ADDRESS_TO_FUND"
fi

# Fund NEO
neo_result=$(check_and_send_neo_transaction "$ADDRESS_TO_FUND" "$NEO_AMOUNT_TO_FUND")
if [ "$neo_result" = "SKIP" ]; then
    print_info "Address $ADDRESS_TO_FUND already has sufficient NEO balance"
elif [ "$neo_result" = "FAILED" ]; then
    print_error "Failed to send NEO transaction to $ADDRESS_TO_FUND"
else
    print_info "Verifying NEO transaction for $ADDRESS_TO_FUND..."
    verify_neo_transaction "$neo_result" "$ADDRESS_TO_FUND"
fi
print_separator
print_success "Script completed successfully"
