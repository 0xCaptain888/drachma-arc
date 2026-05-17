# DRACHMA

**Autonomous Stablecoin Reserve Manager on Arc (Circle L1)**

---

## One-Sentence Pitch

Drachma is an AI agent that autonomously manages stablecoin reserves across USDC, EURC, and USYC on Arc -- eliminating FX exposure loss, idle yield loss, and liquidity timing loss for global freelancers, remote teams, and DAO treasuries.

---

## Problem

| Loss Type | What Happens | Real-World Impact |
|---|---|---|
| **FX Exposure Loss** | Holding only USDC when spending partly in EUR absorbs EUR/USD volatility as a hidden tax. | A Polish freelancer earning $5,000/month and spending 40% in EUR lost ~$1,900 in FX slippage over 2024. |
| **Idle Yield Loss** | USYC (Circle's tokenized money market fund, backed by BlackRock) yields ~4.5% APY. Most holders keep idle USDC earning 0%. | On a $50K treasury, that is $2,250/year left on the table. |
| **Liquidity Timing Loss** | Suboptimal timing between liquid and yield-bearing assets: too much idle for comfort, or redemption delays causing missed payments. | DAO payroll delayed by 48 hours because yield was locked at the wrong moment. |

These three losses compound silently. Drachma eliminates all of them.

---

## Solution

Drachma runs an autonomous AI agent on Arc that rebalances between **USDC**, **EURC**, and **USYC** every 4 hours using Claude's multi-dimensional reasoning across FX exposure, yield optimization, liquidity buffer, and risk signals.

- Every decision is pinned to **IPFS** with a full reasoning trace.
- Every transaction is executed **on-chain** with sub-second finality.
- The vault enforces **owner-set allocation bands** as hard guardrails the agent cannot breach.

**No human in the loop. Full auditability.**

---

## Architecture

```
+------------------------------------------------------------------+
|  L5: Cold-Start Engine                                           |
|  Bootstraps new vaults with sensible defaults from owner profile |
+------------------------------------------------------------------+
        |
        v
+------------------------------------------------------------------+
|  L4: Dashboard (Next.js 14 + Tailwind)                           |
|  Real-time AUM, allocation chart, decision log, band controls    |
+------------------------------------------------------------------+
        |  reads on-chain state + IPFS traces
        v
+------------------------------------------------------------------+
|  L3: IPFS Reasoning Store (Pinata)                               |
|  Immutable JSON reasoning traces, pinned per decision cycle      |
+------------------------------------------------------------------+
        ^  pins trace
        |
+------------------------------------------------------------------+
|  L2: Drachma Agent (MuleRun AI + Python)                         |
|  4-hour cycle: fetch -> reason -> pin -> submit tx               |
|  Skills: market_fetch | llm_reason | ipfs_pin | arc_submit       |
+------------------------------------------------------------------+
        |  calls rebalance()
        v
+------------------------------------------------------------------+
|  L1: DrachmaVault.sol (Solidity 0.8.24 on Arc EVM)               |
|  Owner bands | Agent-only rebalance | On-chain DecisionLog      |
|  Assets: USDC | EURC | USYC | StableFX swaps                   |
+------------------------------------------------------------------+
```

**Data flow:** Agent reads market data and on-chain state, reasons via Claude, pins the trace to IPFS, then submits a `rebalance()` transaction to `DrachmaVault.sol`. The dashboard reads both the chain and IPFS to render a full audit trail.

---

## Circle Tools Integration

- [x] **USDC** -- Primary reserve currency and unit of account
- [x] **EURC** -- FX hedge layer for EUR spending exposure
- [x] **USYC** -- Yield layer via tokenized money market (~4.5% APY)
- [x] **StableFX** -- On-chain USDC <-> EURC swap at oracle rate
- [x] **Circle Agent Wallets** -- Secure agent key management for autonomous signing
- [x] **Paymaster** -- Gasless UX for vault owner transactions

All six Circle primitives are integrated end-to-end, from smart contract interfaces through agent execution to dashboard display.

---

## Why Arc

Three load-bearing properties make Arc the only viable chain for Drachma:

| Property | Why It Matters |
|---|---|
| **Sub-second finality** | Atomic rebalance -- the agent's multi-leg swap (USDC -> EURC -> USYC) settles in one block, eliminating partial-fill risk. |
| **$0.01 flat fee** | Small sweeps are economically viable. A $500 vault can rebalance 6x/day without fees eating the yield. |
| **USYC native on Arc** | No bridging risk. USYC lives on Arc L1, so deposit/redeem is a single contract call, not a cross-chain message. |

---

## Live Links

> Links will be populated for the final submission.

| Resource | URL |
|---|---|
| Dashboard | TBD |
| Demo Vault | TBD |
| Savings Calculator | TBD |
| Arc Explorer | TBD |
| IPFS Sample Trace | TBD |

---

## Project Structure

```
drachma-arc/
├── contracts/                    # Solidity smart contracts (Hardhat)
│   ├── DrachmaVault.sol          # Core vault contract
│   ├── mocks/                    # Test mocks (MockERC20, MockStableFX, MockUSYC)
│   ├── scripts/
│   │   └── deploy.js             # Deployment script
│   ├── test/
│   │   └── DrachmaVault.test.js  # Full test suite
│   ├── hardhat.config.js
│   └── package.json
├── agent/                        # Python AI agent (MuleRun VM)
│   ├── drachma_agent.py          # Main agent loop
│   ├── skills/
│   │   ├── market_fetch/         # Fetch FX rates, yield data, on-chain state
│   │   ├── llm_reason/           # Claude reasoning engine
│   │   ├── ipfs_pin/             # Pin reasoning trace to Pinata
│   │   └── arc_submit/           # Submit rebalance tx to Arc
│   ├── requirements.txt
│   └── .env.example
├── dashboard/                    # Next.js 14 frontend
│   ├── src/
│   │   ├── app/                  # App router pages
│   │   ├── components/           # Reusable UI components
│   │   └── lib/                  # Types, constants, formatters
│   ├── tailwind.config.ts
│   └── package.json
├── docs/                         # Additional documentation
├── docker-compose.yml            # Full-stack orchestration
├── Dockerfile.agent              # Agent container
├── Dockerfile.dashboard          # Dashboard container
├── .env.example                  # All environment variables
├── .gitignore
└── README.md                     # This file
```

---

## Setup Instructions

### Prerequisites

- Node.js >= 18
- Python >= 3.11
- An Arc testnet RPC endpoint
- Anthropic API key
- Pinata API key (for IPFS)

### Smart Contracts

```bash
cd contracts
npm install
cp ../.env.example ../.env   # fill in your keys
npx hardhat compile
npx hardhat test
npx hardhat run scripts/deploy.js --network arc_testnet
```

### Agent

```bash
cd agent
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in your keys
python drachma_agent.py
```

The agent runs a continuous loop, executing a rebalance cycle every 4 hours (configurable via `REBALANCE_INTERVAL`).

### Dashboard

```bash
cd dashboard
npm install
cp ../.env.example .env.local   # fill in NEXT_PUBLIC_* vars
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the dashboard.

### Docker (Full Stack)

```bash
cp .env.example .env   # fill in all variables
docker compose up --build
```

This starts both the agent and dashboard. The dashboard is available at `http://localhost:3000`.

---

## Agent Decision Engine

Every 4 hours, the Drachma agent evaluates four dimensions simultaneously using Claude's structured reasoning:

| Dimension | Input Signals | Output |
|---|---|---|
| **FX Exposure** | EUR/USD spot, 30-day vol, owner's EUR spend ratio | Target EURC allocation (%) |
| **Yield Optimization** | USYC APY, rate trend, competing DeFi yields | Target USYC allocation (%) |
| **Liquidity Buffer** | Upcoming known payments, historical spend cadence | Minimum liquid USDC floor |
| **Risk Signals** | Depeg monitors, protocol health, gas anomalies | Circuit-breaker overrides |

The agent produces a JSON allocation plan constrained by the vault owner's bands (e.g., "USDC must stay between 30-60%"). If the plan violates any band, the agent clamps to the nearest valid allocation. The full reasoning trace -- including all input data, intermediate analysis, and final decision -- is pinned to IPFS before the on-chain transaction is submitted.

**Guardrails:**
- Owner-defined allocation bands are enforced on-chain in `DrachmaVault.sol` -- the agent *cannot* bypass them.
- Every `rebalance()` call logs an immutable `DecisionLog` entry on-chain with the IPFS CID.
- The agent never holds private keys to owner funds; it can only rebalance within the vault's rules.

---

## Traction

> Metrics to be populated at submission.

| Metric | Value |
|---|---|
| Demo vault AUM | TBD |
| Rebalance cycles executed | TBD |
| Cumulative yield captured | TBD |
| FX loss avoided (backtested) | TBD |
| IPFS traces pinned | TBD |

---

## Judging Alignment

| Criterion | Evidence |
|---|---|
| **Technical Implementation** | Production-grade Solidity vault with full test coverage, modular Python agent with 4 skill modules, Next.js dashboard with real-time on-chain reads. |
| **Circle Tools Usage** | All 6 Circle primitives integrated end-to-end: USDC, EURC, USYC, StableFX, Agent Wallets, Paymaster. |
| **User Experience** | One-click vault creation, real-time dashboard, plain-English decision explanations via IPFS traces, gasless owner transactions via Paymaster. |
| **Innovation / Creativity** | First autonomous AI reserve manager on Arc. Multi-dimensional reasoning engine with full auditability. Cold-start engine bootstraps new vaults from owner profiles. |

---

## Post-Hackathon Roadmap

| Phase | Timeline | Deliverables |
|---|---|---|
| **Phase 1: Mainnet Launch** | Q3 2026 | Deploy to Arc mainnet, security audit, open beta with whitelisted vaults. |
| **Phase 2: Multi-Asset Expansion** | Q4 2026 | Add support for additional stablecoins and yield sources as they launch on Arc. |
| **Phase 3: Social Vaults** | Q1 2027 | Shared vaults for DAOs and teams with role-based access and multi-sig band changes. |
| **Phase 4: Cross-Chain Reserves** | Q2 2027 | Bridge integration for vaults that span Arc and other Circle-supported chains. |

---

## License

MIT -- see [LICENSE](LICENSE) for details.
