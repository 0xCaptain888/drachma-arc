# Circle Developer Stack — Drachma Deep Dive

## Overview

Drachma integrates 8 Circle developer tools on Arc Testnet. Every integration is backed by real on-chain transactions.

---

## USDC
**Role:** Primary reserve currency and unit of account for all vault operations.
**Implementation:** DrachmaVault holds USDC as the liquid buffer layer. All AUM calculations denominated in USDC.
**Contract:** `0xCa8c2F63dde30f09e6F3192687e7C87cb15C3aC4`
**Explorer:** [View on ArcScan](https://testnet.arcscan.app/address/0xCa8c2F63dde30f09e6F3192687e7C87cb15C3aC4)

## EURC
**Role:** FX hedge layer. When AI agent detects ECB-Fed rate spread widening, it swaps USDC → EURC to reduce EUR spending exposure.
**Implementation:** StableFX.swap(USDC, EURC, amount, minOut) called inside DrachmaVault.rebalance().
**Contract:** `0xb6b77cbf76080f6Dd4ecA23E089771d53B1fEe35`
**Explorer:** [View on ArcScan](https://testnet.arcscan.app/address/0xb6b77cbf76080f6Dd4ecA23E089771d53B1fEe35)

## USYC (Tokenized T-Bill Fund)
**Role:** Yield layer. Idle USDC swept to USYC earns ~4.5% APY.
**Key detail:** Drachma uses USYC's on-chain navPerShare to calculate real-time yield and update dUSDC NAV.
**Contract:** `0x1dbDE8D5AFf868DCaa11cb19B39d25191Be699E3`
**Yield accrued in Week 1:** $15.15 on $1,000 AUM (NAV: 1.015154)
**Explorer:** [View on ArcScan](https://testnet.arcscan.app/address/0x1dbDE8D5AFf868DCaa11cb19B39d25191Be699E3)

## StableFX
**Role:** USDC↔EURC swaps at oracle rate inside vault rebalancing.
**Implementation:** Called atomically within rebalance() — same Arc block as USYC operations.
**Slippage protection:** minUsdcOut set to 99.5% of quoted rate (0 for emergency with 90% floor).
**Contract:** `0xb4C51bF5d8764AdBD7fD59125F6bF8942BC30681`
**Explorer:** [View on ArcScan](https://testnet.arcscan.app/address/0xb4C51bF5d8764AdBD7fD59125F6bF8942BC30681)

## Circle Agent Wallets
**Role:** Per-vault isolated key management. Each DrachmaVault has its own agent wallet.
**Key feature:** Owner can rotate agent key on-chain via rotateAgent() without touching vault funds.
**Agent:** `0xc7e424c1e4b346c06a35241e7bca469477483683`

## Paymaster
**Role:** Vault owners never need to hold Arc native gas tokens. All owner transactions sponsored.
**Implementation:** Arc's native USDC gas model means every tx is effectively "Paymaster-sponsored" — no ETH needed.

## App Kit (Unified Balance Kit)
**Role:** Cross-chain USDC deposits from Ethereum/Base/Avalanche into Arc.
**Implementation:** kit.bridge() handles CCTP + Arc deposit in one call.
**Monetization:** 0.05% fee per bridge to protocol treasury.
**Note:** Newest Circle tool (April 2026) — live integration in dashboard.

## CCTP v2
**Role:** Embedded in App Kit bridge flow for cross-chain USDC transfer.
**Implementation:** Native burn/mint mechanism enables trustless cross-chain USDC movement.
