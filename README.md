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
   To fund accounts on NeoX, you can use the `tools/funding/neox-funding.csv` to add addresses and amounts. The funding will be processed automatically after the NeoX node starts.

   Optionally, you can invoke again the funding script manually if needed:
   ```bash
    docker compose run --rm neox-funding
   ```
   Note that running the funding script multiple times will fund all the addresses in `tools/funding/neox-funding.csv`.

### NeoN3
   To fund an account on NeoN3 it has to be added to the command line of the neo-n3 service in the `docker-compose.yml` as follows:
   ```yaml
   entrypoint: [
   "sh", "-c",
   "screen -dmS node expect -n /root/tools/run-neo-node.expect neo \"<N3_ADDRESS>\" \"<GAS_AMOUNT>\" (etcetera...)"
   ]
   ```
  Where `<N3_ADDRESS>` is the address to fund and `<GAS_AMOUNT>` is the amount of GAS token to be sent to the indicated address. Any other addresses you want to fund will have to be funded manually after the node is started.

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
