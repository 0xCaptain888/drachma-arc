# Drachma Protocol — Deployment Guide

## Prerequisites

- Node.js 18+
- Python 3.11+
- Arc Testnet USDC (get from https://faucet.circle.com)

## Quick Start (5 minutes)

### 1. Clone & Install

```bash
git clone https://github.com/0xCaptain888/drachma-arc
cd drachma-arc
cp .env.example .env
# Edit .env with your keys
```

### 2. Deploy Contracts

```bash
cd contracts
npm install
npx hardhat run scripts/deploy-full.js --network arc_testnet
```

This deploys: DrachmaSignalBus, DrachmaScoreOracle, DrachmaFactory, DrachmaVault.

### 3. Run the Agent

```bash
cd ../agent
pip install -r requirements.txt
python drachma_agent_v2.py
```

The agent starts immediately. First decision within ~30 seconds.

### 4. Dashboard (optional)

```bash
cd ../dashboard
npm install
npm run dev
```

## Already-Deployed Contracts (Arc Testnet)

| Contract | Address |
|----------|---------|
| DrachmaVault | `0xD3D5b81b28b51aDdc5A3a06231C5d0ED782E1995` |
| DrachmaSignalBus | `0xE66b90e5be9Fd497e2b0c57FF4a9F8A3b32f3Ff6` |
| DrachmaScoreOracle | `0xF1d8e224755c609AdF735CaEd3c45CEC0391337B` |
| DrachmaFactory | `0x00aa544Cd58Cb785D7B70EB1805cFF2900008133` |

## Architecture

```
Owner → Natural Language → Drachma Agent (event-driven)
                              ├── Circle MCP (real market data)
                              ├── LLM reasoning (4 dimensions)
                              └── Signal Push → SignalBus
                                                 ↓ ConsensusReached
                              All agents ← ──────┘
                                    ↓
                              DrachmaVault.rebalance()
                              ├── USDC (liquidity buffer)
                              ├── EURC (FX hedge)
                              └── USYC (yield ~4.5% APY)
```
