#!/usr/bin/env bash

# NEO N3 Funding Script
# This script opens a wallet, checks GAS balance, sends GAS to an address, 
# and waits for the transaction to be confirmed

set -e  # Exit on any error

# Set default RPC URL if not provided
if [ -z "$NEON3_RPC_URL" ]; then
    echo "NEON3_RPC_URL environment variable not found, using default value"
    NEON3_RPC_URL="http://localhost:40332"
    echo "Using default RPC URL: $NEON3_RPC_URL"
fi

# Check if required parameters are provided
if [ $# -lt 2 ]; then
    echo "Error: Both address and amount parameters are required"
    echo "Usage: $0 <address_to_fund> <amount_to_fund>"
    echo "Example: $0 NfU6xJ3k7zL4vM8nQ9wE2rT5yI1oP6aS7dF 10000"
    exit 1
fi

# Set the address and amount from parameters
ADDRESS_TO_FUND="$1"
AMOUNT_TO_FUND="$2"

# GAS token contract hash
GAS_TOKEN_HASH="0xd2a4cff31913016155e38e474a2c06d08be276cf"

echo "Opening wallet..."
# Open wallet using RPC call
WALLET_RESPONSE=$(curl -s -X POST "$NEON3_RPC_URL" \
    -H "Content-Type: application/json" \
    -d '{
        "jsonrpc": "2.0",
        "method": "openwallet",
        "params": ["/neo-cli/wallet.json", "neo"],
        "id": 1
    }')

echo "Wallet response: $WALLET_RESPONSE"

# Check if wallet was opened successfully
WALLET_SUCCESS=$(echo "$WALLET_RESPONSE" | jq -r '.result')
if [ "$WALLET_SUCCESS" != "true" ]; then
    echo "Error: Failed to open wallet"
    echo "Response: $WALLET_RESPONSE"
    exit 1
fi

echo "Wallet opened successfully"

echo "Checking GAS balance for address: $ADDRESS_TO_FUND"
# Get NEP-17 balances (including GAS)
BALANCE_RESPONSE=$(curl -s -X POST "$NEON3_RPC_URL" \
    -H "Content-Type: application/json" \
    -d "{
        \"jsonrpc\": \"2.0\",
        \"method\": \"getnep17balances\",
        \"params\": [\"$ADDRESS_TO_FUND\"],
        \"id\": 2
    }")

echo "Balance response: $BALANCE_RESPONSE"

# Extract GAS balance from the response
GAS_BALANCE=$(echo "$BALANCE_RESPONSE" | jq -r '.result.balance[] | select(.assethash == "'$GAS_TOKEN_HASH'") | .amount // "0"')

# Handle case where GAS token is not found in balance response
if [ -z "$GAS_BALANCE" ] || [ "$GAS_BALANCE" = "null" ]; then
    GAS_BALANCE="0"
fi

echo "Current GAS balance: $GAS_BALANCE"

# Check if balance is greater than 0
if [ "$GAS_BALANCE" -gt 0 ]; then
    echo "GAS balance is greater than 0 ($GAS_BALANCE), skipping GAS transfer"
else
    echo "GAS balance is 0, sending $AMOUNT_TO_FUND GAS to $ADDRESS_TO_FUND"
    # Send 10000 GAS to the deployer address
    SEND_RESPONSE=$(curl -s -X POST "$NEON3_RPC_URL" \
        -H "Content-Type: application/json" \
        -d "{
            \"jsonrpc\": \"2.0\",
            \"method\": \"sendtoaddress\",
            \"params\": [\"$GAS_TOKEN_HASH\", \"$ADDRESS_TO_FUND\", $AMOUNT_TO_FUND],
            \"id\": 3
        }")

    echo "Send response: $SEND_RESPONSE"

    # Check if transaction was successful
    TRANSACTION_HASH=$(echo "$SEND_RESPONSE" | jq -r '.result.hash // empty')
    if [ -n "$TRANSACTION_HASH" ]; then
        echo "Transaction successful! Hash: $TRANSACTION_HASH"
        echo "Waiting for transaction confirmation..."
        
        # Wait for transaction to be included in a block
        while true; do
            TX_RESPONSE=$(curl -s -X POST "$NEON3_RPC_URL" \
                -H "Content-Type: application/json" \
                -d "{
                    \"jsonrpc\": \"2.0\",
                    \"method\": \"getrawtransaction\",
                    \"params\": [\"$TRANSACTION_HASH\", true],
                    \"id\": 4
                }")
            
            # Check if transaction has blockhash (indicating it's confirmed)
            BLOCKHASH=$(echo "$TX_RESPONSE" | jq -r '.result.blockhash // empty')
            if [ -n "$BLOCKHASH" ] && [ "$BLOCKHASH" != "null" ]; then
                CONFIRMATIONS=$(echo "$TX_RESPONSE" | jq -r '.result.confirmations // 0')
                echo "Transaction confirmed! Block hash: $BLOCKHASH"
                echo "Confirmations: $CONFIRMATIONS"
                break
            else
                echo "Transaction not yet confirmed, waiting 2 seconds..."
                sleep 2
            fi
        done
    else
        echo "Error: Transaction failed"
        echo "Response: $SEND_RESPONSE"
        exit 1
    fi
fi

echo "Script completed successfully"
