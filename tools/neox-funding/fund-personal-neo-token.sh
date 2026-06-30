#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
WALLET_NAME="${PERSONAL_WALLET_NAME:-personal}"
PERSONAL_WALLET_HOST="$ROOT_DIR/tools/neox-funding/neox-wallets/${WALLET_NAME}.json"
DEPLOYER_WALLET_HOST="$ROOT_DIR/tools/neox-funding/neox-wallets/deployer.json"
ADDRESSES_FILE="$ROOT_DIR/tools/addresses/neox-addresses.json"
TOKEN_AMOUNT="${TOKEN_AMOUNT:-1000}"

if [ ! -f "$ADDRESSES_FILE" ]; then
  echo "NeoX deployment addresses not found: $ADDRESSES_FILE" >&2
  echo "Start the devnet and wait for neox-contracts to finish deployment first." >&2
  exit 1
fi

if [ ! -f "$DEPLOYER_WALLET_HOST" ]; then
  echo "Deployer wallet not found: $DEPLOYER_WALLET_HOST" >&2
  exit 1
fi

if [ ! -f "$PERSONAL_WALLET_HOST" ]; then
  echo "Personal wallet not found: $PERSONAL_WALLET_HOST" >&2
  echo "Create it with:" >&2
  echo "  cd bridge-evm-contracts && npm run ops -- accounts create-keystore --path ../tools/neox-funding/neox-wallets/${WALLET_NAME}.json" >&2
  exit 1
fi

cd "$ROOT_DIR"
docker compose run --rm --no-deps \
  -e PERSONAL_WALLET_NAME="$WALLET_NAME" \
  -e TOKEN_AMOUNT="$TOKEN_AMOUNT" \
  neox-contracts \
  bash -lc '
    set -euo pipefail
    TOKEN_ADDRESS="$(jq -r ".neoToken // empty" /tools/addresses/neox-addresses.json)"
    if [ -z "$TOKEN_ADDRESS" ]; then
      echo "neoToken missing from /tools/addresses/neox-addresses.json" >&2
      exit 1
    fi

    NEOX_RPC_URL="${NEOX_RPC_URL:-http://neox-node:8562}" \
    TOKEN_ADDRESS="$TOKEN_ADDRESS" \
    TOKEN_AMOUNT="${TOKEN_AMOUNT:-1000}" \
    DEPLOYER_WALLET_JSON="/app/wallets/deployer.json" \
    PERSONAL_WALLET_JSON="/app/wallets/${PERSONAL_WALLET_NAME:-personal}.json" \
    CONTRACTS_ROOT="/app" \
    node /tools/neox-funding/fund-personal-neo-token.js
  '
