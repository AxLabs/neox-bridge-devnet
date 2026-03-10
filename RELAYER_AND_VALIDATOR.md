# Running Relayer and Validators

This document describes how to run the **bridge relayer** and **validators** for the Neo N3 ↔ Neo X bridge. Example configurations are located in `bridge/.testing-devnet`.

## Prerequisites

- **Devnet running**: Neo X node (port 8562), Neo N3 node (port 40332), and RabbitMQ (port 5672) must be running. Use `docker compose up` to start the devnet.
- **Bridge contracts deployed**: Ensure `neox-contracts` and `neon3-contracts` have completed successfully.
- **Go 1.24+**: Required to build the relayer and validator binaries.

## Architecture Overview

- **Relayer**: Submits transactions to both chains (deposits, withdrawals, message execution). Requires wallets for Neo X (EVM keystore) and Neo N3 (NEP-6 wallet). Communicates with validators via RabbitMQ.
- **Validators**: Sign deposit/withdrawal roots and message batches. Each validator runs with a unique `validator_id` and its own Neo X + Neo N3 wallets. Validators must match the addresses/public keys configured in the bridge contracts.

## GitHub Repositories

| Repository | URL | Description |
|------------|-----|-------------|
| **bridge** | https://github.com/bane-labs/bridge | Relayer and validator binaries (Go). Code also lives in `bridge/` in this repo. |
| **go-ethereum** | https://github.com/bane-labs/go-ethereum | Neo X node (EVM-compatible fork) |
| **bridge-evm-contracts** | https://github.com/bane-labs/bridge-evm-contracts | EVM bridge contracts |
| **bridge-neo-contracts** | https://github.com/bane-labs/bridge-neo-contracts | Neo N3 bridge contracts |
| **neox-bridge-devnet** | https://github.com/AxLabs/neox-bridge-devnet | This devnet (Docker Compose, tools) |
| **bridge-examples-ts** | https://github.com/AxLabs/bridge-examples-ts | TypeScript examples for bridge SDK |

## Building the Binaries

From the `bridge` directory:

```bash
cd bridge

# Build relayer
GOARCH=amd64 GOOS=linux go build -o ./bin/bridge-relayer cmd/relayer/relayer.go

# Build validator (same binary, different config)
go build -o ./bin/bridge-validator cmd/validator/validator.go
```

For other platforms, set `GOARCH` and `GOOS` accordingly (e.g. `GOOS=darwin` for macOS).

## Configuration

### Example Configs Location

Example configs and wallets for the devnet are in:

```
bridge/.testing-devnet/
├── relayer/
│   ├── config-relayer-devnet.yaml
│   ├── wallet-relayer-devnet-neo.json      # N3 wallet
│   ├── wallet-relayer-devnet-evm.json      # EVM keystore (or .json in neox_keystore_dir)
│   └── logs/
├── validator01/
│   ├── config-validator01-devnet.yaml
│   ├── wallet-val01-devnet-neo.json
│   └── wallet-val01-devnet-evm.json
└── validator02/
    ├── config-validator02-devnet.yaml
    ├── wallet-val02-devnet-neo.json
    └── wallet-val02-devnet-evm.json
```

### Relayer Config (`config-relayer.yaml`)

Key fields (see `bridge/.testing-devnet/relayer/config-relayer-devnet.yaml`):

```yaml
store_path: data-relayer
store_prefix_deposit: "dn3"
store_prefix_withdrawal: "wnx"

message_broker_url: amqp://admin:admin123@localhost:5672
message_broker_connect_max_retry: 5
message_broker_channel_max_retry: 5
queue_cleanup_enabled: false
queue_management_port: 15672

# Neo X (EVM)
neox_node_url: http://localhost:8562
neox_keystore_dir: /path/to/relayer/           # Dir containing EVM keystore
neox_bridge_contract_addr: 0x43732d5509fA9B54A87977e3D9c234810b3F8443
neox_message_bridge_contract_addr: 0x1795E681aa56aD07F71E292F52cbB0b7245544FA
neox_default_gas_limit: 200000
neox_default_gas_price: 30000000000
neox_start_block_number: 0
neox_catch_up_interval: 500

# Neo N3
n3_node_url: http://localhost:40332
n3_key_pair_file: /path/to/wallet-relayer-devnet-neo.json
n3_bridge_contract_addr: 0x356376dcd5580f49f8b4d1274745ac55ad858784
n3_message_bridge_contract_addr: 0xbd98300a1951d72533fa749010265f71c4cfff38
n3_start_block_number: 0
n3_catch_up_interval: 500

# Validator addresses (must match BridgeManagement on both chains)
validator_neox_threshold: 2
validator_neox_addresses:
  1: 0x400ed3982d9d8e64e364cf3a2403ed2b8c224026
  2: 0x86828f1c19ff90c4a0c0daee9f068a6065f3b047

validator_n3_threshold: 2
validator_n3_public_keys:
  1: 02a0150e31043503248d2e3cb1e55011062d19a02a2da82f3cb55d9a1b967a601d
  2: 02c884c593d2706c7c372d7770e987520c347654312b039a76d83bf822036f10f4

logs_level: "info"
logs_file: "/path/to/logs/relayer.log"
logs_file_rotate_max_size: "5"
logs_to_stdout: true
```

### Validator Config (`config-validator.yaml`)

Each validator uses a unique `validator_id` (1, 2, …). Example for validator 1:

```yaml
validator_id: 1

store_path: data-val01

message_broker_url: amqp://admin:admin123@localhost:5672
message_broker_connect_max_retry: 5
message_broker_channel_max_retry: 5

# Neo X
neox_node_url: http://localhost:8562
neox_keystore_dir: /path/to/validator01/
neox_bridge_contract_addr: 0x43732d5509fA9B54A87977e3D9c234810b3F8443
neox_message_bridge_contract_addr: 0x1795E681aa56aD07F71E292F52cbB0b7245544FA
neox_start_block_number: 0
neox_catch_up_interval: 500

# Neo N3
n3_node_url: http://localhost:40332
n3_key_pair_file: /path/to/validator01/wallet-val01-devnet-neo.json
n3_bridge_contract_addr: 0x356376dcd5580f49f8b4d1274745ac55ad858784
n3_message_bridge_contract_addr: 0xbd98300a1951d72533fa749010265f71c4cfff38
n3_start_block_number: 0
n3_catch_up_interval: 500

node_max_retry: 5
node_max_backoff_time: 10

logs_level: "debug"
logs_file: "/path/to/validator01.log"
logs_file_rotate_max_size: "5"
logs_to_stdout: true
```

### Environment Variable Overrides

- **Relayer**: Use `RELAYER_` prefix (e.g. `RELAYER_MESSAGE_BROKER_URL`, `RELAYER_NEOX_NODE_URL`).
- **Validator**: Use `VALIDATOR_` prefix (e.g. `VALIDATOR_MESSAGE_BROKER_URL`, `VALIDATOR_NEOX_KEYSTORE_DIR`).

## Running

### 1. Start the Devnet

```bash
docker compose up -d
```

Wait for `neox-contracts` and `neon3-contracts` to finish. Ensure RabbitMQ is running (port 5672).

### 2. Start Validators First

Validators must be running before the relayer, as the relayer depends on validator signatures.

```bash
cd bridge

# Terminal 1 – Validator 1
./bin/bridge-validator --config .testing-devnet/validator01/config-validator01-devnet.yaml

# Terminal 2 – Validator 2
./bin/bridge-validator --config .testing-devnet/validator02/config-validator02-devnet.yaml
```

You will be prompted for wallet passwords (Neo N3 and Neo X). Use empty password if the devnet wallets have none.

### 3. Start the Relayer

```bash
cd bridge

./bin/bridge-relayer --config .testing-devnet/relayer/config-relayer-devnet.yaml
```

Again, you will be prompted for wallet passwords.

### 4. Optional: Run in Background (screen)

```bash
# Relayer
screen -S relayer
./bin/bridge-relayer --config .testing-devnet/relayer/config-relayer-devnet.yaml
# Ctrl+A, D to detach

# Validator 1
screen -S validator01
./bin/bridge-validator --config .testing-devnet/validator01/config-validator01-devnet.yaml
# Ctrl+A, D to detach

# Validator 2
screen -S validator02
./bin/bridge-validator --config .testing-devnet/validator02/config-validator02-devnet.yaml
# Ctrl+A, D to detach

# Reattach: screen -r relayer
```

## Wallets

- **Neo X**: EVM-compatible keystore (e.g. JSON from `tools/neox-funding/neox-wallets` or `bridge-evm-contracts/scripts/wallet/createWallet.ts`). Place in `neox_keystore_dir`.
- **Neo N3**: NEP-6 wallet JSON. Path set via `n3_key_pair_file`.

The relayer wallet must be the configured **relayer** address in BridgeManagement. Validator wallets must match the **validator** addresses/public keys in BridgeManagement on both chains.

## Contract Addresses

Contract addresses in the example configs are for the default devnet deployment. If you redeploy, update:

- `neox_bridge_contract_addr`
- `neox_message_bridge_contract_addr`
- `n3_bridge_contract_addr` (script hash, hex)
- `n3_message_bridge_contract_addr` (script hash, hex)

Deployed addresses are in `tools/addresses/` (e.g. `neox-addresses.json`, `n3-addresses.json`).

## Troubleshooting

- **RabbitMQ connection refused**: Ensure RabbitMQ is running (`docker compose up rabbitmq`) and `message_broker_url` is correct.
- **RPC connection errors**: Verify Neo X (8562) and Neo N3 (40332) RPC endpoints.
- **Invalid validator signatures**: Ensure validator addresses/public keys in config match BridgeManagement on both chains.
- **Wallet path errors**: Use absolute paths in config, or run from the directory where relative paths are resolved.

## Related Documentation

- [bridge/RELAYER.md](bridge/RELAYER.md) – Relayer-specific setup
- [README.md](README.md) – Devnet setup and quick start
- [bridgeman/README.md](bridgeman/README.md) – Bridge Manager (alternative watcher/executor)
