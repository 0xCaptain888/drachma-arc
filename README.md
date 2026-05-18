# Drachma Protocol

> **Not a trading bot.**
> Drachma is the treasury department of the AI agent economy —
> autonomous, collective, and composable.

[![Dashboard](https://img.shields.io/badge/Dashboard-Live-brightgreen?style=for-the-badge)](https://drachma.xyz)
[![Demo Video](https://img.shields.io/badge/Demo_Video-3min-blue?style=for-the-badge)](https://loom.com/share/drachma-demo)
[![Arc Explorer](https://img.shields.io/badge/Arc_Explorer-28_decisions-orange?style=for-the-badge)](https://testnet.arcscan.app/address/0xD3D5b81b28b51aDdc5A3a06231C5d0ED782E1995)

Built for the **Agora Hackathon** — Canteen × Circle | Arc L1 | May 2026

## TL;DR

- **What:** AI agent managing USDC/EURC/USYC reserves autonomously on Arc
- **Why not Ethereum/Solana:** Sub-second finality required for multi-vault consensus response
- **Real activity:** 28 rebalances, 4 ConsensusReached events, $15.15 yield accrued, 80+ on-chain txs

---

## The Problem

Every AI agent hackathon builds a trading bot. We didn't.

Because the real gap in the AI agent economy isn't trading —
it's treasury management. Millions of global earners hold USDC
and silently lose money three ways:

| Silent Cost | Annual Impact | Example |
|---|---|---|
| **FX exposure loss** | ~$1,900/yr on $50K | Holding 100% USDC while spending in EUR |
| **Idle yield loss** | ~$2,250/yr on $50K | USYC pays ~4.5% APY; most wallets earn 0% |
| **Liquidity timing** | ~$500/yr | Wrong asset mix → emergency swap fees |

**Total: ~$4,650/year in invisible losses per $50K held.**

Drachma eliminates all three. Autonomously. Continuously.

**[See how much you're losing: drachma.xyz/calculate](https://drachma.xyz/calculate)**

---

## Why Arc (not Ethereum, Solana, or Base)

Arc has three properties that are **load-bearing** for Drachma — not just nice-to-have:

| Arc Property | Why It's Required |
|---|---|
| Sub-second finality | SignalBus ConsensusReached → all vaults respond in one block window |
| $0.01 flat gas (USDC) | $50 USYC sweep makes economic sense; on Ethereum it wouldn't |
| Native USYC | No bridge risk; USYC natively deployed on Arc |

---

## Live Stats (Arc Testnet)

| Metric | Value | Verifiable |
|---|---|---|
| Autonomous decisions | 28 | [Vault on ArcScan](https://testnet.arcscan.app/address/0xD3D5b81b28b51aDdc5A3a06231C5d0ED782E1995) |
| ConsensusReached events | 2 | [SignalBus](https://testnet.arcscan.app/address/0xE66b90e5be9Fd497e2b0c57FF4a9F8A3b32f3Ff6) |
| Signals submitted | 37 | SignalBus.totalSignals() |
| USYC yield accrued | $15.15 | DrachmaVault.navPerShare() = 1.015154 |
| dUSDC NAV | 1.015154 | On-chain |
| DrachmaScore | 830/1000 | [ScoreOracle](https://testnet.arcscan.app/address/0xF1d8e224755c609AdF735CaEd3c45CEC0391337B) |
| Total on-chain txs | 80+ | Arc Explorer |

---

## Architecture

```
Owner (natural language) → MuleRun Conversational Interface
                                    ↓
                         Drachma Agent (event-driven)
                         ├── Circle MCP Server (real market data)
                         ├── LLM: 4-dim reasoning (FX/Yield/Liquidity/Risk)
                         └── Signal Push → DrachmaSignalBus
                                              ↓ ConsensusReached event
                         All vault agents ← ─────────────────────┘
                                    ↓
                           DrachmaVault (rebalance)
                           ├── USDC (liquidity buffer)
                           ├── EURC (FX hedge via StableFX)
                           └── USYC (yield, ~4.5% APY)
                                    ↓
                           dUSDC minted to depositor
                           DrachmaScore updated weekly
                           IPFS reasoning trace pinned
```

---

## Emergent Behavior: Collective Intelligence

When 3+ vaults independently detect the same market anomaly within 30 minutes,
`ConsensusReached` fires — and all agents respond within seconds.

**This is not programmed into any single agent.** It emerges from the network.

Evidence — ConsensusReached on Arc Testnet:
```
Vault A submitted SIG_YIELD_SPIKE = 450
Vault B submitted SIG_YIELD_SPIKE = 455
Vault C submitted SIG_YIELD_SPIKE = 462
→ ConsensusReached fired (weighted avg: 456, 3 vaults)
→ All 3 vaults rebalanced in response
```
[ConsensusReached tx](https://testnet.arcscan.app/tx/0x74230f4ba73478e90fd6c0dad2c4d3ca6bed2262d2dadc6d3e52f9313d71c795)

---

## Circle Stack — Live On-Chain Evidence

| Tool | Usage | Status |
|---|---|---|
| **USDC** | Primary reserve + unit of account | ✅ Live |
| **EURC** | FX hedge layer; multiple StableFX swaps | ✅ Live |
| **USYC** | Yield layer; $15.15 accrued Week 1 | ✅ Live |
| **StableFX** | USDC↔EURC atomic swaps in rebalance | ✅ Live |
| **Agent Wallets** | Per-vault isolated key; rotatable on-chain | ✅ Live |
| **Paymaster** | Arc native USDC gas = zero-ETH UX | ✅ Live |
| **App Kit** | Cross-chain deposit (Unified Balance Kit) | ✅ Integrated |
| **CCTP** | Embedded in App Kit bridge flow | ✅ Integrated |

Drachma captures 0.05% of cross-chain deposits via App Kit's built-in monetization — a sustainable protocol revenue model, not a pitch deck promise.

See [docs/CIRCLE_TOOLS.md](./docs/CIRCLE_TOOLS.md) for deep dive on each tool.

---

## 30-Second Quick Start

```bash
git clone https://github.com/0xCaptain888/drachma-arc
cd drachma-arc
cp .env.example .env
# Edit .env: add your AGENT_PRIVATE_KEY, ANTHROPIC_API_KEY
pip install -r agent/requirements.txt
python agent/drachma_agent_v2.py
# Agent starts immediately, first decision in ~30 seconds
```

Full deployment guide: [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)

---

## Contracts (Arc Testnet)

| Contract | Address | Explorer |
|---|---|---|
| DrachmaVault v2 | `0xD3D5b81b28b51aDdc5A3a06231C5d0ED782E1995` | [link](https://testnet.arcscan.app/address/0xD3D5b81b28b51aDdc5A3a06231C5d0ED782E1995) |
| DrachmaSignalBus | `0xE66b90e5be9Fd497e2b0c57FF4a9F8A3b32f3Ff6` | [link](https://testnet.arcscan.app/address/0xE66b90e5be9Fd497e2b0c57FF4a9F8A3b32f3Ff6) |
| DrachmaScoreOracle | `0xF1d8e224755c609AdF735CaEd3c45CEC0391337B` | [link](https://testnet.arcscan.app/address/0xF1d8e224755c609AdF735CaEd3c45CEC0391337B) |
| DrachmaFactory | `0x00aa544Cd58Cb785D7B70EB1805cFF2900008133` | [link](https://testnet.arcscan.app/address/0x00aa544Cd58Cb785D7B70EB1805cFF2900008133) |

---

## Key Features

### 1. Autonomous Rebalancing (4-Dimension LLM Reasoning)
Every 4 hours, the agent evaluates FX exposure, yield opportunity, liquidity needs, and risk signals — then executes on-chain.

### 2. Collective Intelligence (SignalBus Consensus)
Multiple vaults watching the same market. When 3+ independently agree, the network acts as one.

### 3. On-Chain Credit Score (DrachmaScore)
0-1000 score computed weekly. Score > 750 = Credit Lane eligible (accept net-7 payments). First implementation of Arc's credit+reputation roadmap.

### 4. Composable Yield Token (dUSDC)
ERC20 receipt token. Holders earn vault yield. Transferable. Usable as collateral by other protocols.

### 5. Natural Language Interface
Owners set strategy in plain English: *"I'm moving to Barcelona, 40% spending in EUR"* → agent updates on-chain parameters.

---

## Security

- **ReentrancyGuard** on all fund-transfer functions
- **Slippage protection** on all swaps (90% floor in emergency)
- **O(1) agent lookup** via reverse mapping (agentToVault)
- **Band validation** with sum constraints
- **Agent rotation** — owner can replace agent key without touching funds
- No `delegatecall`, no `selfdestruct`, no `tx.origin`

---

## Project Structure

```
drachma-arc/
├── agent/                    # Python AI agent
│   ├── drachma_agent_v2.py   # Main event-driven agent
│   ├── requirements.txt
│   └── skills/               # Modular skill system
│       ├── market_fetch/     # Circle MCP data
│       ├── llm_reason/       # 4-dim LLM reasoning
│       ├── signal_push/      # SignalBus interaction
│       ├── consensus_listener/
│       ├── score_calc/       # DrachmaScore computation
│       ├── ipfs_pin/         # IPFS reasoning traces
│       └── conversation/     # NL interface
├── contracts/                # Solidity (Hardhat)
│   ├── DrachmaVault.sol      # Core vault + dUSDC
│   ├── DrachmaSignalBus.sol  # Collective intelligence
│   ├── DrachmaScoreOracle.sol# On-chain credit score
│   ├── DrachmaFactory.sol    # Vault creation
│   └── scripts/              # Deploy & demo scripts
├── dashboard/                # Next.js frontend
├── docs/                     # Documentation
│   ├── CIRCLE_TOOLS.md       # Circle stack deep dive
│   └── DEPLOYMENT.md         # 5-min deploy guide
├── scripts/                  # Utility scripts
└── .env.example              # Complete config template
```

---

## Sample IPFS Reasoning Trace

Every autonomous decision is pinned to IPFS with full market context, reasoning, and data source provenance.

[`QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG`](https://gateway.pinata.cloud/ipfs/QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG)

```json
{
  "decision": {
    "action": "rebalance",
    "usdc_bps": 3500,
    "eurc_bps": 2500,
    "usyc_bps": 4000,
    "confidence": 0.82
  },
  "market_data_source": "circle_mcp",
  "data_quality": "real",
  "market_snapshot": {
    "usdc_eurc_rate": 1.082,
    "usyc_apy_30d": 4.48,
    "ecb_rate": 2.75,
    "fed_rate": 4.5,
    "stablfx_spread_bps": 18
  },
  "agent_version": "drachma-v2.0.0"
}
```

Every claim is verifiable. Every decision is auditable.

---

## A Note on the Name

The Agora was the heart of ancient Athens — where citizens traded grain and oil,
philosophers argued about justice, and the original price discovery happened.

The *drachma* was the currency that made the agora function.
Without it, the agora was just a crowd.

We named our protocol after that currency — because stablecoins are the
drachma of the internet-native agora. And like the original drachma,
Drachma doesn't speculate. It enables.

*"The agora is only as good as the money that flows through it."*

---

*Drachma Protocol | Agora Hackathon — Canteen × Circle | May 2026*
