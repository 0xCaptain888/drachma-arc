# DRACHMA NETWORK

**AI Agents Collectively Managing Stablecoin Reserves on Arc**

> N vaults. One network. Every agent makes all agents smarter.

Built for the Agora Hackathon — Canteen × Circle | Arc L1 | May 2026

---

## The Problem

Three silent costs destroy stablecoin holders every year:

| Cost | Impact | Example |
|------|--------|---------|
| FX Exposure | ~$1,900/year on $50K | Holding 100% USD when 35% spending is EUR |
| Idle Yield | 4.5% APY missed | USDC sitting in wallet instead of USYC |
| Liquidity Timing | ~$500/year | Wrong asset at wrong time → emergency swap fees |

**Total: ~$3,200/year in invisible losses per $50K held.**

[Calculate your losses →](https://drachma.vercel.app/calculate)

---

## The Solution: Drachma Network

Drachma is the first **collective intelligence network for stablecoin reserve management** on Arc.

Each vault is autonomously managed by an AI agent. But unlike solo bots, Drachma agents form a network:

- **Signal Bus**: When one agent detects a market anomaly (EURC depeg, USYC NAV drop, liquidity thin), it broadcasts a signal on-chain
- **Consensus**: When 3+ agents independently report the same anomaly within 30 minutes, `ConsensusReached` fires
- **Collective Response**: All agents rebalance within 30 seconds — faster than any human, coordinated without a central server

### Three Primitives, Only Possible on Arc

| Primitive | What It Does | Why Arc |
|-----------|-------------|---------|
| **DrachmaSignalBus** | Multi-agent collective intelligence protocol | Consensus → response in < 1s (Arc block time) |
| **DrachmaScore** | On-chain reserve credit scoring (0-1000) | First "credit + identity + reputation" implementation on Arc |
| **dUSDC** | Composable AI-managed yield receipt token | $0.01 gas makes micro-rebalances economical |

---

## Architecture

```
DRACHMA PROTOCOL v2

ON-CHAIN (Arc EVM)
├── DrachmaVault (per user) — USDC/EURC/USYC + dUSDC ERC20
├── DrachmaSignalBus — multi-vault signal coordination + consensus
├── DrachmaScoreOracle — on-chain credit scoring + Credit Lane
└── DrachmaFactory — one-click vault deployment

AGENT LAYER (MuleRun VM)
├── Event-driven main loop (asyncio)
├── 4-dimension LLM reasoning (Claude)
├── Signal anomaly detection + push
├── Consensus event listener (WebSocket)
├── Weekly DrachmaScore computation
└── Natural language treasury interface

INTERFACE LAYER
├── MuleRun Conversational Treasury
└── Next.js Dashboard (/, /network, /score, /calculate, /app)

DATA LAYER
├── IPFS (Pinata) — reasoning traces + score evidence
└── Arc Explorer — all transactions verifiable
```

---

## Circle Tools Integration

| Tool | Usage | On-Chain Evidence |
|------|-------|-------------------|
| **USDC** | Primary reserve + dUSDC backing | Every vault balance |
| **EURC** | FX hedge layer | Rebalance tx swap amounts |
| **USYC** | Yield layer (4.5% APY) | Deposit/redeem in rebalance |
| **StableFX** | USDC ↔ EURC oracle-rate swaps | Swap events in rebalance |
| **Agent Wallets** | One per vault, autonomous tx signing | Every rebalance/signal tx |
| **Paymaster** | Zero-gas owner transactions | All owner deposit/withdraw/updateBands |

---

## Smart Contracts

| Contract | Description |
|----------|-------------|
| `DrachmaVault.sol` | Reserve manager + dUSDC ERC20 receipt token |
| `DrachmaSignalBus.sol` | Multi-agent signal coordination + consensus detection |
| `DrachmaScoreOracle.sol` | On-chain credit scoring (0-1000) + Credit Lane |
| `DrachmaFactory.sol` | One-click vault deployment + registration |

### Deployment Order

```bash
# 1. SignalBus (no deps)
# 2. ScoreOracle (no deps)
# 3. Factory (depends on 1+2)
# 4. Wire: SignalBus.setFactory + ScoreOracle.setFactory
# 5. Factory.createVault → deploys vault + registers everywhere
```

---

## Agent System

Event-driven architecture with priority queue:

| Trigger | Priority | Response Time | Behavior |
|---------|----------|---------------|----------|
| ConsensusReached (DEPEG) | CRITICAL | < 30s | Bypass LLM, emergency exit |
| ConsensusReached (high) | HIGH | < 60s | Urgent LLM reasoning |
| ConsensusReached (any) | MEDIUM | < 3min | Standard LLM + consensus context |
| Regular cycle | SCHEDULED | 4 hours | Full 4-dimension reasoning |
| Macro calendar | PRE-MACRO | 15min before | Pre-position for ECB/Fed |

### Decision Dimensions

1. **FX Exposure**: ECB-Fed rate differential, EUR/USD volatility, EUR spending share
2. **Yield Optimization**: USYC APY vs T+1 redemption lag tradeoff
3. **Liquidity Buffer**: Monthly outflow coverage + upcoming payment reserves
4. **Risk Signals**: Depeg alerts, NAV anomalies, StableFX spread, **network consensus**

---

## DrachmaScore

On-chain reserve credit scoring (0-1000):

| Component | Max | Measures |
|-----------|-----|----------|
| Yield Performance | 300 | Vault yield vs USYC benchmark |
| Band Discipline | 250 | % time within owner-set allocation bands |
| Risk Response | 250 | Speed + accuracy of risk signal responses |
| Consistency | 200 | Operational uptime × stability |

**Score > 750 → Credit Lane access** (future: enhanced borrowing terms, lower collateral requirements)

Every score update includes an IPFS evidence CID — fully auditable computation.

---

## dUSDC

Composable yield receipt token:

- Deposit USDC → mint dUSDC at current NAV
- dUSDC appreciates as vault earns yield (USYC + FX optimization)
- Redeem dUSDC → receive USDC at current NAV
- Freely transferable, usable as collateral in other protocols

```
NAV per share: tracks vault performance
1.000000 → 1.000842 (after 7 days of operation)
```

---

## Natural Language Treasury Interface

Vault owners interact via MuleRun conversational AI:

```
Owner: "I'm moving to Barcelona next month, 40% spending in EUR"
Agent: Current EURC: 22%. Suggesting EURC target 25-55%.
       Confirm? [Yes / No / Adjust]
Owner: Yes
Agent: ✅ Updated on-chain. TX: 0x7f3a...
```

---

## Dashboard

| Page | Description |
|------|-------------|
| `/` | Vault overview + network activity ticker + dUSDC NAV chart |
| `/network` | Signal Bus monitoring — live signals, consensus history, signal distribution |
| `/score` | DrachmaScore leaderboard + radar chart breakdown |
| `/calculate` | Stablecoin loss calculator (traction tool) |
| `/app` | Owner control panel — deposit, withdraw, bands, profile |

---

## Setup

### Prerequisites
- Node.js 18+
- Python 3.11+
- Hardhat

### Contracts
```bash
cd contracts
npm install
cp ../.env.example ../.env  # fill in values
npx hardhat compile
npx hardhat run scripts/deploy.js --network arc_testnet
```

### Agent
```bash
cd agent
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # fill in deployed addresses + keys
python drachma_agent_v2.py
```

### Dashboard
```bash
cd dashboard
npm install
cp ../.env.example .env.local  # fill in NEXT_PUBLIC vars
npm run dev
```

---

## Project Structure

```
drachma-arc/
├── contracts/
│   ├── DrachmaVault.sol          # Reserve vault + dUSDC ERC20
│   ├── DrachmaSignalBus.sol      # Collective intelligence
│   ├── DrachmaScoreOracle.sol    # On-chain credit scoring
│   ├── DrachmaFactory.sol        # One-click deployment
│   ├── mocks/                    # Test mocks
│   ├── scripts/deploy.js         # Full deployment script
│   └── test/                     # Hardhat tests
├── agent/
│   ├── drachma_agent_v2.py       # Event-driven main loop
│   └── skills/
│       ├── market_fetch/         # Market data + anomaly fields
│       ├── llm_reason/           # Standard + urgent LLM modes
│       ├── signal_push/          # Anomaly detection + Signal Bus
│       ├── consensus_listener/   # ConsensusReached WebSocket
│       ├── score_calc/           # Weekly DrachmaScore computation
│       ├── conversation/         # Natural language interface
│       ├── arc_submit/           # v2 transaction submission
│       └── ipfs_pin/             # IPFS pinning (decisions + scores)
├── dashboard/
│   └── src/
│       ├── app/                  # Pages: /, /network, /score, /calculate, /app
│       ├── components/           # UI components
│       └── lib/                  # Types, constants, utilities
├── .env.example
├── Dockerfile.agent
├── Dockerfile.dashboard
└── README.md
```

---

## On-Chain Evidence

All activity is verifiable on Arc Explorer:

- `Rebalanced` events → vault allocation changes
- `SignalSubmitted` events → market anomaly detections
- `ConsensusReached` events → multi-agent consensus
- `ScoreUpdated` events → weekly credit score updates
- `Transfer(dUSDC)` events → receipt token minting
- IPFS CIDs → full reasoning traces + score evidence

---

## Innovation

> Drachma v2 is the first on-chain reserve credit network on Arc.
>
> Three primitives appear on Arc for the first time:
> - **DrachmaSignalBus**: multi-agent collective intelligence protocol
> - **DrachmaScore**: on-chain reserve credit scoring
> - **dUSDC**: composable AI-managed yield receipt token
>
> These primitives are not viable on Ethereum, Solana, or Base:
> SignalBus consensus-response requires < 1s block time;
> dUSDC micro-rebalances require $0.01 gas;
> USYC is natively deployed only on Arc.
>
> Arc is not Drachma's runtime — Arc is why Drachma exists.

---

## License

MIT

---

*Drachma Network — Collective Intelligence for Stablecoin Reserves*
*Built on Arc | Powered by MuleRun + Claude | Agora Hackathon 2026*
