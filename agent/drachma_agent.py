"""
Drachma Agent — Autonomous Stablecoin Reserve Manager
Runs on MuleRun VM (persistent, 24/7). Decision cycle: every 4 hours.

Dependencies:
    pip install anthropic web3 httpx python-dotenv
"""

import os, json, time, hashlib
from datetime import datetime, timezone
from dataclasses import dataclass

import anthropic
import httpx
from web3 import Web3
from dotenv import load_dotenv

load_dotenv()

# ─── Config ──────────────────────────────────────────────────────────────────
ARC_RPC            = os.getenv("ARC_RPC_URL")
VAULT_ADDRESS      = os.getenv("VAULT_ADDRESS")
AGENT_PRIVATE_KEY  = os.getenv("AGENT_PRIVATE_KEY")
ANTHROPIC_API_KEY  = os.getenv("ANTHROPIC_API_KEY")
IPFS_ENDPOINT      = os.getenv("IPFS_ENDPOINT", "https://api.pinata.cloud/pinning/pinJSONToIPFS")
IPFS_JWT           = os.getenv("IPFS_JWT")
REBALANCE_INTERVAL = int(os.getenv("REBALANCE_INTERVAL", 14400))  # 4h default

client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
w3     = Web3(Web3.HTTPProvider(ARC_RPC))


# ─── Market Data ─────────────────────────────────────────────────────────────
@dataclass
class MarketSnapshot:
    usdc_eurc_rate:         float
    usyc_nav_per_share:     float
    usyc_apy_30d:           float
    ecb_rate:               float
    fed_rate:               float
    eur_usd_1w_implied_vol: float
    depeg_alerts:           list
    vault_usdc:             float
    vault_eurc:             float
    vault_usyc_shares:      float
    vault_total_aum_usdc:   float
    owner_profile:          dict


def fetch_market_data(vault_state: dict, owner_profile: dict) -> MarketSnapshot:
    import random
    return MarketSnapshot(
        usdc_eurc_rate         = 1.082 + random.uniform(-0.003, 0.003),
        usyc_nav_per_share     = 1.00 + (0.045 / 365) * 30,
        usyc_apy_30d           = 4.48 + random.uniform(-0.1, 0.1),
        ecb_rate               = 3.5,
        fed_rate               = 4.75,
        eur_usd_1w_implied_vol = 5.2 + random.uniform(-0.3, 0.3),
        depeg_alerts           = [],
        vault_usdc             = vault_state.get("usdc", 0),
        vault_eurc             = vault_state.get("eurc", 0),
        vault_usyc_shares      = vault_state.get("usyc_shares", 0),
        vault_total_aum_usdc   = vault_state.get("total_aum", 0),
        owner_profile          = owner_profile,
    )


# ─── LLM System Prompt ───────────────────────────────────────────────────────
SYSTEM_PROMPT = """
You are Drachma, an autonomous stablecoin reserve manager running on Arc (Circle's L1).
Your sole job: decide the optimal allocation split between USDC, EURC, and USYC
for a user's vault, given their profile and current market conditions.

CONSTRAINTS (hardcoded, never violate):
- USDC: 20-60% of AUM
- EURC: 10-40% of AUM
- USYC: 20-60% of AUM
- The three must sum to exactly 10000 basis points (100%)
- Never recommend a move < 2% of AUM (gas and friction not worth it)
- If confidence < 0.6, set action to "hold"

YOUR DECISION PROCESS (reason through ALL 4 dimensions every time):
1. FX EXPOSURE: Does the owner's spending currency mix warrant more/less EURC?
   Consider: ECB vs Fed rate differential, implied vol, upcoming macro events.
2. YIELD OPTIMIZATION: Is USYC yield worth the T+1 redemption lag?
   Consider: owner's upcoming payment schedule, idle USDC break-even (2 days).
3. LIQUIDITY BUFFER: How much USDC must stay liquid for near-term payments?
   Formula: max(monthly_outflow * 0.5, upcoming_payments * 1.1)
4. RISK SIGNALS: Any depeg alerts? Unusual spreads? Emergency exit needed?

OUTPUT FORMAT — strict JSON, no other text, no markdown fences:
{
  "usdc_bps": <int 2000-6000>,
  "eurc_bps": <int 1000-4000>,
  "usyc_bps": <int 2000-6000>,
  "action": "rebalance" | "hold" | "emergency_exit",
  "confidence": <float 0-1>,
  "reasoning": {
    "fx": "<one paragraph>",
    "yield": "<one paragraph>",
    "liquidity": "<one paragraph>",
    "risk": "<one paragraph>",
    "decision_summary": "<two sentences max, shown on dashboard>"
  },
  "expected_impact": {
    "annualized_yield_gain_usdc": <float>,
    "fx_exposure_delta_pct": <float>,
    "liquidity_change_usdc": <float>
  }
}
"""

def build_user_prompt(snap: MarketSnapshot) -> str:
    aum = snap.vault_total_aum_usdc
    return f"""
CURRENT VAULT STATE:
  USDC:       ${snap.vault_usdc:,.2f}  ({snap.vault_usdc/aum*100:.1f}% of AUM)
  EURC:       {snap.vault_eurc:,.2f} EURC  (≈${snap.vault_eurc * snap.usdc_eurc_rate:,.2f}, {snap.vault_eurc*snap.usdc_eurc_rate/aum*100:.1f}%)
  USYC:       {snap.vault_usyc_shares:,.4f} shares  (≈${snap.vault_usyc_shares * snap.usyc_nav_per_share:,.2f})
  TOTAL AUM:  ${aum:,.2f}

MARKET CONDITIONS:
  USDC/EURC rate:          1 EURC = {snap.usdc_eurc_rate:.4f} USDC
  USYC 30d APY:            {snap.usyc_apy_30d:.2f}%
  USYC NAV/share:          ${snap.usyc_nav_per_share:.6f}
  ECB deposit rate:        {snap.ecb_rate:.2f}%
  Fed funds rate:          {snap.fed_rate:.2f}%
  ECB-Fed spread:          {snap.ecb_rate - snap.fed_rate:+.2f}%
  EUR/USD 1W implied vol:  {snap.eur_usd_1w_implied_vol:.1f}%
  Depeg alerts:            {snap.depeg_alerts or "None"}

OWNER PROFILE:
  Primary spending currency:    {snap.owner_profile.get('spending_currency', 'USD')}
  Secondary spending currency:  {snap.owner_profile.get('secondary_currency', 'EUR')}
  EUR spending share:           {snap.owner_profile.get('eur_spending_pct', 30)}%
  Monthly outflow (USDC equiv): ${snap.owner_profile.get('monthly_outflow_usdc', 2000):,.0f}
  Risk tolerance:               {snap.owner_profile.get('risk_tolerance', 'conservative')}
  Upcoming large payments:      {snap.owner_profile.get('upcoming_payments', 'none')}

Timestamp: {datetime.now(timezone.utc).isoformat()}

Reason through all 4 dimensions, then output JSON only.
"""


def call_llm(snap: MarketSnapshot) -> dict:
    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1200,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": build_user_prompt(snap)}]
    )
    raw = response.content[0].text.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"): raw = raw[4:]
    return json.loads(raw.strip())


# ─── IPFS Reasoning Pin ───────────────────────────────────────────────────────
def pin_reasoning(decision: dict, snap: MarketSnapshot) -> str:
    payload = {
        "pinataContent": {
            "decision": decision,
            "market_snapshot": {
                "usdc_eurc_rate":         snap.usdc_eurc_rate,
                "usyc_apy_30d":           snap.usyc_apy_30d,
                "ecb_rate":               snap.ecb_rate,
                "fed_rate":               snap.fed_rate,
                "eur_usd_1w_implied_vol": snap.eur_usd_1w_implied_vol,
                "depeg_alerts":           snap.depeg_alerts,
            },
            "vault_aum_usdc": snap.vault_total_aum_usdc,
            "timestamp":      datetime.now(timezone.utc).isoformat(),
            "agent_version":  "drachma-0.1.0",
        },
        "pinataMetadata": {"name": f"drachma-decision-{int(time.time())}"}
    }
    resp = httpx.post(
        IPFS_ENDPOINT,
        headers={"Authorization": f"Bearer {IPFS_JWT}"},
        json=payload, timeout=30
    )
    resp.raise_for_status()
    cid = resp.json()["IpfsHash"]
    return "0x" + hashlib.sha256(cid.encode()).hexdigest()


# ─── Arc Transaction Submission ───────────────────────────────────────────────
VAULT_ABI = json.loads('[{"name":"rebalance","type":"function","inputs":[{"name":"targetUsdcBps","type":"uint16"},{"name":"targetEurcBps","type":"uint16"},{"name":"targetUsycBps","type":"uint16"},{"name":"reasoningCID","type":"bytes32"},{"name":"minUsdcOut","type":"uint256"}],"outputs":[]},{"name":"emergencyExit","type":"function","inputs":[{"name":"reasoningCID","type":"bytes32"}],"outputs":[]},{"name":"totalAum","type":"function","stateMutability":"view","inputs":[],"outputs":[{"name":"usdc","type":"uint256"},{"name":"eurc","type":"uint256"},{"name":"usyc","type":"uint256"},{"name":"totalInUsdc","type":"uint256"}]}]')


def submit_rebalance(decision: dict, cid_bytes32: str) -> str:
    account = w3.eth.account.from_key(AGENT_PRIVATE_KEY)
    vault   = w3.eth.contract(address=Web3.to_checksum_address(VAULT_ADDRESS), abi=VAULT_ABI)
    base_tx = {
        "from": account.address,
        "nonce": w3.eth.get_transaction_count(account.address),
        "gas": 700_000,
        "maxFeePerGas": w3.to_wei("1", "gwei"),
        "maxPriorityFeePerGas": w3.to_wei("0.1", "gwei"),
    }
    cid_bytes = bytes.fromhex(cid_bytes32[2:])

    if decision["action"] == "emergency_exit":
        tx = vault.functions.emergencyExit(cid_bytes).build_transaction({**base_tx, "gas": 500_000})
    elif decision["action"] == "rebalance":
        tx = vault.functions.rebalance(
            decision["usdc_bps"], decision["eurc_bps"], decision["usyc_bps"],
            cid_bytes, 0
        ).build_transaction(base_tx)
    else:
        return "hold — no tx submitted"

    signed  = w3.eth.account.sign_transaction(tx, AGENT_PRIVATE_KEY)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    w3.eth.wait_for_transaction_receipt(tx_hash, timeout=30)
    return tx_hash.hex()


# ─── Main Loop ────────────────────────────────────────────────────────────────
def run_agent(owner_profile: dict):
    print(f"[Drachma] Agent started. Vault: {VAULT_ADDRESS}")

    while True:
        try:
            vault = w3.eth.contract(address=Web3.to_checksum_address(VAULT_ADDRESS), abi=VAULT_ABI)
            usdc, eurc, usyc_shares, total = vault.functions.totalAum().call()
            vault_state = {
                "usdc": usdc / 1e6, "eurc": eurc / 1e6,
                "usyc_shares": usyc_shares / 1e18, "total_aum": total / 1e6,
            }

            snap = fetch_market_data(vault_state, owner_profile)

            print(f"[{datetime.now(timezone.utc).isoformat()}] Calling LLM — AUM: ${snap.vault_total_aum_usdc:,.2f}")
            decision = call_llm(snap)
            print(f"[Drachma] {decision['action'].upper()} | "
                  f"USDC={decision['usdc_bps']/100:.1f}% "
                  f"EURC={decision['eurc_bps']/100:.1f}% "
                  f"USYC={decision['usyc_bps']/100:.1f}% | "
                  f"conf={decision['confidence']:.2f}")
            print(f"[Drachma] {decision['reasoning']['decision_summary']}")

            cid = pin_reasoning(decision, snap)

            if decision["action"] != "hold":
                tx_hash = submit_rebalance(decision, cid)
                print(f"[Drachma] TX: {tx_hash}")
            else:
                print("[Drachma] Holding — no tx.")

        except Exception as e:
            print(f"[Drachma] ERROR: {e}")

        time.sleep(REBALANCE_INTERVAL)


if __name__ == "__main__":
    profile = {
        "spending_currency": "USD",
        "secondary_currency": "EUR",
        "eur_spending_pct": 35,
        "monthly_outflow_usdc": 3000,
        "risk_tolerance": "moderate",
        "upcoming_payments": "none",
    }
    run_agent(profile)
