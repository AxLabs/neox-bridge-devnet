#!/usr/bin/env bash

# -e: exit immediately if a command fails
# -u: treat unset variables as an error
# -o pipefail: make pipelines fail if any command fails
set -euo pipefail

# Load utility functions from container full path
source "/tools/utils/neo-utils.sh"

# wait_for_json_value <file> <jq_filter> [timeout_sec] [interval_sec]
wait_for_json_value() {
  local file="$1"
  local filter="$2"
  local timeout="${3:-180}"    # default: 3 minutes
  local interval="${4:-2}"     # default: 2 seconds
  local deadline=$((SECONDS + timeout))
  local value=""

  # Ensure immediate flushing of echo output
    # (use stdbuf if available — works on most systems, including Docker)
    if command -v stdbuf >/dev/null 2>&1; then
      exec 1> >(stdbuf -oL cat)  # line-buffered stdout
      exec 2> >(stdbuf -oL cat >&2)
    fi

  # All progress/status goes to stderr so command substitution won't swallow it
  >&2 echo "Waiting for ${filter} in ${file} (timeout: ${timeout}s)..."

  while :; do
    if [[ -f "$file" ]]; then
      value="$(jq -r "${filter} // empty" "$file" 2>/dev/null || true)"
      if [[ -n "$value" && "$value" != "null" ]]; then
        >&2 echo   # newline after dots
        >&2 echo "✅ Found ${filter}: ${value}"
        # Only the value goes to stdout (so $(...) captures just this)
        printf "%s" "$value"
        return 0
      fi
    else
      >&2 echo "File not found yet: ${file}"
    fi

    (( SECONDS >= deadline )) && {
      >&2 echo    # newline after dots
      >&2 echo "❌ Timeout: ${filter} not found in ${file} after ${timeout}s"
      return 1
    }

    # Print a dot to stderr; use printf (more predictable than echo -n)
    printf "." >&2
    sleep "$interval"
  done
}

# shellcheck disable=SC2155
export BRIDGE_HASH=$(jq -r '.bridge' /tools/addresses/n3-addresses.json)

echo ''
echo 'Registering NEO in BridgeContract'
echo "Using Bridge: $BRIDGE_HASH"

export TOKEN_REGISTRATION_TOKEN_CONTRACT_HASH_ON_N3=0xef4073a0f2b305a38ec4050e4d3d28bc40ea63f5
EVM_ADDRESSES_FILE=/tools/addresses/neox-addresses.json
# shellcheck disable=SC2155
export TOKEN_REGISTRATION_TOKEN_CONTRACT_HASH_ON_EVM="$(wait_for_json_value "$EVM_ADDRESSES_FILE" '.neoToken' 180 2)" || exit 1
export TOKEN_REGISTRATION_DEPOSIT_FEE=10000000
export TOKEN_REGISTRATION_MIN_AMOUNT=1
export TOKEN_REGISTRATION_MAX_AMOUNT=10000
export TOKEN_REGISTRATION_MAX_WITHDRAWALS=100
export TOKEN_REGISTRATION_DECIMAL_SCALING_FACTOR=0

main_class="network.bane.scripts.token.RegisterToken"
run_gradle_class "$main_class"
