# Bridge DevNet

A development environment for cross-chain bridge development between NeoX and NeoN3 blockchains.

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
Note that running the funding script multiple times will fund all the addresses in `tools/funding/neox-funding.csv` as well as the default accounts.

### NeoN3:
To fund accounts on NeoN3, you can use the `FUNDED_ADDRESS` and `GAS_AMOUNT` env variables of the `neon3-funding` service. The funding will be processed automatically after the NeoN3 node starts, and it will also fund all the wallets in the `/tools/neon3-funding/neon3-wallets` dir.

Optionally, you can invoke again the funding script manually if needed:
   ```bash
   docker compose up -d neon3-funding
   ```
Note that running the funding service multiple times will fund all the wallets in the `neon3-wallets` dir only if they have less balance than the `GAS_AMOUNT` env variable.

## Check node availability

To verify that the nodes are up and responding via RPC:

### Neo X:
   ```bash
   curl -X POST --json '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' http://localhost:8562
   ```

### Neo N3:
   ```bash
   curl -s -X POST --json '{"jsonrpc" : "2.0", "id": 1, "method": "getblockcount", "params":[] }' http://localhost:40332
   ```

## Deployment of EVM message bridge contracts

The EVM contracts are deployed automatically when the `deploy-message-bridge` service starts. It uses the wallets in the
`tools/neox-wallets` folder to deploy the contracts. The deployment logs can be found in the `deploy-message-bridge`
service logs.

The service can be run manually if needed:

```bash
docker compose run --rm deploy-message-bridge
```
