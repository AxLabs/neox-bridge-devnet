# Bridge DevNet

A development environment for cross-chain bridge development between NeoX and NeoN3 blockchains.

## Table of Contents
- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Clone the repository (with submodules)](#clone-the-repository-with-submodules)
- [Quick Start](#quick-start)
- [Funding Accounts](#funding-accounts)
  - [NeoX](#neox)
  - [NeoN3](#neon3)
- [Check Node Availability](#check-node-availability)
- [Deployment of EVM Message Bridge Contracts](#deployment-of-evm-message-bridge-contracts)
    - [Initial Setup](#initial-setup)
    - [Changing Contracts And Deploying Again](#changing-contracts-and-deploying-again)
- [Additional Tools](#additional-tools)
  - [Sending Messages from NEOX to NEON3](#sending-messages-from-neox-to-neon3)
    - [Sending a String Message](#1-sending-a-string-message)
    - [Sending an N3 Scripthash Message](#2-sending-an-n3-scripthash-message)
    - [Sending a Custom Message](#3-sending-a-custom-message)
  - [Sending Messages from NEON3 to NEOX](#sending-messages-from-neon3-to-neox)
    - [Sending a String Message](#1-sending-a-string-message-1)
    - [Sending an EVM Contract Call](#2-sending-an-evm-contract-call)
    - [Sending a Custom Message](#3-sending-a-custom-message-1)

## Overview

This project provides a complete development stack with:
- **NeoX Node**: Ethereum-compatible blockchain node with dBFT consensus
- **NeoN3 Node**: Neo N3 blockchain node for cross-chain operations
- **RabbitMQ**: Message broker for inter-service communication

## Prerequisites

- Docker & Docker Compose

## Clone the repository (with submodules)

1. **First-time clone:**
   ```bash
   git clone --recurse-submodules https://github.com/AxLabs/neox-bridge-devnet.git
   cd neox-bridge-devnet
   ```

2. **If you already cloned without submodules:**
   ```bash
   git submodule update --init --recursive
   ```

## Quick Start

1. **Navigate to the project directory:**
   ```bash
   cd neox-bridge-devnet
   ```

2. **Start all services:**
   ```bash
   docker compose up
   ```

3. **Access the services:**
   - NeoX RPC: http://localhost:8562
   - NeoN3 RPC: http://localhost:40332
   - RabbitMQ Management UI: http://localhost:15672 (admin/admin123)
   - RabbitMQ AMQP URL: amqp://admin:admin123@localhost:5672/

4. **Stop all services:**
    ```bash
    docker compose down
    ```

    To remove volumes (reset blockchain data):
    ```bash
    docker compose down -v
    ```

## Funding Accounts
### NeoX:
To fund accounts on NeoX, you can use the `tools/funding/neox-funding.csv` to add addresses and amounts. The funding will be processed automatically after the NeoX node starts, by the `neox-funding` service.

Optionally, you can invoke again the funding script manually if needed:
   ```bash
    docker compose up -d neox-funding
   ```
Note that running the funding script multiple times will fund all the addresses in `tools/funding/neox-funding.csv` as well as the default accounts only if they have less balance than the `GAS_AMOUNT` env variable.

### NeoN3:
To fund accounts on NeoN3, you can use the `FUNDED_ADDRESS` and `GAS_AMOUNT` env variables of the `neon3-funding` service. The funding will be processed automatically after the NeoN3 node starts, and it will also fund all the wallets in the `/tools/neon3-funding/neon3-wallets` dir.

Optionally, you can invoke again the funding script manually if needed:
   ```bash
   docker compose up -d neon3-funding
   ```
Note that running the funding service multiple times will fund all the wallets in the `neon3-wallets` dir only if they have less balance than the `GAS_AMOUNT` env variable.

## Check Node Availability

To verify that the nodes are up and responding via RPC:

### Neo X:
   ```bash
   curl -X POST --json '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' http://localhost:8562
   ```

### Neo N3:
   ```bash
   curl -s -X POST --json '{"jsonrpc" : "2.0", "id": 1, "method": "getblockcount", "params":[] }' http://localhost:40332
   ```

## Deployment of EVM Message Bridge Contracts

### Initial Setup

#### NeoX EVM Contracts Deployment

The EVM contracts are deployed automatically when the `neox-contracts` service starts. It uses the wallets in the `tools/neox-funding/neox-wallets` folder to deploy the contracts. The deployment logs can be found in the `neox-contracts` service logs.

The service can also be run manually if it did not start automatically. This service depends on the NeoX node being operational and the deployer wallet having sufficient funds:

```bash
docker compose up -d neox-contracts
```

#### NeoN3 Contracts Deployment

The NeoN3 contracts are deployed automatically when the `neon3-contracts` service starts. It uses the wallets in the `tools/neon3-funding/neon3-wallets` folder to deploy the contracts. The deployment logs can be found in the `neon3-contracts` service logs.

The service can also be run manually if it did not start automatically. This service depends on the NeoN3 node being operational and the deployer wallet having sufficient funds:

```bash
docker compose up -d neon3-contracts
```

### Changing Contracts And Deploying Again
If you make changes to the contracts and want to deploy them again, you can follow these steps:
1. **Stop all the services:**
   ```bash
   docker compose down -v
   ```
2. **Checkout the desired branch or make changes to the contracts repos.**
3. **Update the service definitions and commands** 

   Make sure that the correct deployment script is invoked by the `neox-contracts` and `neon3-contracts` services. Ensure that all expected environment variables are correctly set and any required volumes are correctly mounted.

   The scripts used for deployment are located as follows:q
     - NeoX: [tools/deploy/deploy-neox-message-bridge-contracts.sh](tools/deploy/deploy-neox-message-bridge-contracts.sh) 
     - NeoN3: [tools/deploy/deploy-n3-message-bridge-contracts.expect](tools/deploy/deploy-n3-message-bridge-contracts.expect)

4. **Start the services again:**
   ```bash
   docker compose up -d
   ```

## Additional Tools

### Sending Messages from NEOX to NEON3

To send messages from NeoX to NeoN3, use scripts in `tools/send-from-evm`. The default wallet is `deployer`, override with `PERSONAL_WALLET_FILENAME`. Wallets must exist in `bridge-evm-contracts/wallets` (auto-copied from `tools/neox-funding/neox-wallets` if missing).

If the wallet has insufficient funds, the script will fail. Fund the wallet beforehand (see [Funding Accounts](#funding-accounts)).

#### 1. Sending a String Message

```bash
./tools/send-from-evm/send-string.sh <message> [network]
```
- `<message>`: String message to send (required).
- `[network]`: Target NeoN3 network (optional, default: `neoxDevnet`).

**Environment Variables:**
- `PERSONAL_WALLET_FILENAME`: Wallet name (default: deployer)

#### 2. Sending an N3 Scripthash Message

```bash
./tools/send-from-evm/send-n3-script.sh <script_hex> [store_result] [network]
```
- `<script_hex>`: Hex-encoded NeoN3 script (required).
- `[store_result]`: Store result (`true` or `false`, default: `true`).
- `[network]`: Target NeoN3 network (optional, default: `neoxDevnet`).

N3 scripts are always sent as executable messages.

**Environment Variables:**
- Same as above.

#### 3. Sending a Custom Message

```bash
./tools/send-from-evm/send-message.sh [OPTIONS]
```
**Options:**
- `-a, --address ADDRESS`: MessageBridge contract address (auto-loaded from `tools/addresses/neox-addresses.json`)
- `-t, --type TYPE`: Message type (`executable` or `store-only`, default: `store-only`)
- `-d, --data DATA`: Raw hex message data, string message, or NeoN3 script bytes
- `-s, --store-result BOOL`: Store result for executable messages (default: true)
- `-n, --network NETWORK`: Hardhat network (default: neoxDevnet)
- `-h, --help`: Show help

**Environment Variables:**
- `PERSONAL_WALLET_FILENAME`

**Notes:**
- MessageBridge address is auto-loaded if not provided.
- Wallets are auto-copied if missing.
- If you encounter issues, check script output and verify wallet balances and environment variables.

### Sending Messages from NEON3 to NEOX

Use scripts in `tools/send-from-neo`. The default wallet is `deployer`, override with `SENDER_WALLET`. Wallets must exist in `bridge-neo-contracts/wallets` (auto-copied from `tools/neon3-funding/neon3-wallets` if missing).

If the wallet has insufficient funds, the script will fail. Fund the wallet beforehand (see [Funding Accounts](#funding-accounts)).

#### 1. Sending a String Message

```bash
./tools/send-from-neo/send-string.sh <message> [node_url]
```
- `<message>`: String message to send (required).
- `[node_url]`: NeoN3 RPC endpoint URL (optional, default: http://127.0.0.1:40332).

**Environment Variables:**
- `SENDER_WALLET`: User wallet JSON file (default: wallets/deployer.json)
- `SENDER_WALLET_PASSWORD`: Wallet password

#### 2. Sending an EVM Contract Call

```bash
./tools/send-from-neo/send-evm-call.sh <evm_data_hex> [store_result] [node_url]
```
- `<evm_data_hex>`: Hex-encoded EVM contract call data (required).
- `[store_result]`: Store result (`true` or `false`, default: `true`).
- `[node_url]`: NeoN3 RPC endpoint URL (optional, default: http://127.0.0.1:40332).

**Environment Variables:**
- Same as above.

#### 3. Sending a Custom Message

```bash
./tools/send-from-neo/send-message.sh [OPTIONS]
```
**Options:**
- `-a, --address ADDRESS`: MessageBridge contract hash (auto-loaded from `tools/addresses/n3-addresses.json`)
- `-t, --type TYPE`: Message type (`executable` or `store-only`, default: `store-only`)
- `-d, --data DATA`: Raw hex message data, string message, or EVM contract call data
- `-f, --fee-sponsor HASH160`: Fee sponsor hash160 (optional)
- `-s, --store-result BOOL`: Store result for executable messages (default: true)
- `-n, --node URL`: NeoN3 RPC endpoint URL (default: http://127.0.0.1:40332)
- `-h, --help`: Show help

**Environment Variables:**
- `SENDER_WALLET`: User wallet JSON file (default: wallets/deployer.json)
- `SENDER_WALLET_PASSWORD`: Wallet password

**Notes:**
- MessageBridge hash is auto-loaded if not provided.
- Wallets are auto-copied if missing.
- If you encounter issues, check script output and verify your environment variables and wallet balances.
