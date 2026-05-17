"""
LLM Reason Skill
================
Calls Claude claude-sonnet-4-20250514 with the 4-dimension system prompt for stablecoin
reserve allocation decisions. Parses and validates the JSON output.

Standalone module — can be invoked directly or via MuleRun skill trigger:
    "reason about allocation for {snapshot}"
"""

import os
import json
import logging
from datetime import datetime, timezone
from typing import Any

import anthropic
from dotenv import load_dotenv

# Import MarketSnapshot type for annotations
try:
    from skills.market_fetch.market_fetch import MarketSnapshot
except ImportError:
    from agent.skills.market_fetch.market_fetch import MarketSnapshot  # type: ignore

load_dotenv()

logger = logging.getLogger("drachma.llm_reason")

# ─── Config ──────────────────────────────────────────────────────────────────
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
LLM_MODEL         = os.getenv("LLM_MODEL", "claude-sonnet-4-20250514")
LLM_MAX_TOKENS    = int(os.getenv("LLM_MAX_TOKENS", 1200))

_client = None


def _get_client() -> anthropic.Anthropic:
    """Lazy-init Anthropic client."""
    global _client
    if _client is None:
        _client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    return _client


# ─── System Prompt ───────────────────────────────────────────────────────────
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


# ─── User Prompt Builder ────────────────────────────────────────────────────
def build_user_prompt(snap: MarketSnapshot) -> str:
    """Render the user prompt with current vault state and market data."""
    aum = snap.vault_total_aum_usdc
    if aum <= 0:
        raise ValueError("Vault AUM must be positive for allocation reasoning")

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


# ─── Decision Validation ────────────────────────────────────────────────────
class DecisionValidationError(Exception):
    """Raised when the LLM decision fails constraint validation."""
    pass


def validate_decision(decision: dict) -> dict:
    """
    Validate a parsed LLM decision against hard constraints.

    Raises DecisionValidationError if any constraint is violated.
    Returns the decision dict unchanged if valid.
    """
    required_keys = {"usdc_bps", "eurc_bps", "usyc_bps", "action", "confidence", "reasoning"}
    missing = required_keys - set(decision.keys())
    if missing:
        raise DecisionValidationError(f"Missing required keys: {missing}")

    # BPS range checks
    usdc = decision["usdc_bps"]
    eurc = decision["eurc_bps"]
    usyc = decision["usyc_bps"]

    if not (2000 <= usdc <= 6000):
        raise DecisionValidationError(f"usdc_bps={usdc} out of range [2000, 6000]")
    if not (1000 <= eurc <= 4000):
        raise DecisionValidationError(f"eurc_bps={eurc} out of range [1000, 4000]")
    if not (2000 <= usyc <= 6000):
        raise DecisionValidationError(f"usyc_bps={usyc} out of range [2000, 6000]")

    total = usdc + eurc + usyc
    if total != 10000:
        raise DecisionValidationError(f"BPS sum={total}, must be exactly 10000")

    # Action validation
    valid_actions = {"rebalance", "hold", "emergency_exit"}
    if decision["action"] not in valid_actions:
        raise DecisionValidationError(
            f"action='{decision['action']}' not in {valid_actions}"
        )

    # Confidence validation
    conf = decision["confidence"]
    if not (0.0 <= conf <= 1.0):
        raise DecisionValidationError(f"confidence={conf} out of range [0, 1]")

    # Low-confidence override: force hold
    if conf < 0.6 and decision["action"] != "hold":
        logger.warning(
            "Confidence %.2f < 0.6 but action='%s' — overriding to 'hold'",
            conf, decision["action"],
        )
        decision["action"] = "hold"

    # Reasoning sub-keys
    reasoning = decision.get("reasoning", {})
    reasoning_keys = {"fx", "yield", "liquidity", "risk", "decision_summary"}
    missing_r = reasoning_keys - set(reasoning.keys())
    if missing_r:
        raise DecisionValidationError(f"Missing reasoning keys: {missing_r}")

    return decision


# ─── LLM Call ────────────────────────────────────────────────────────────────
def call_llm(snap: MarketSnapshot) -> dict:
    """
    Call the LLM with market snapshot and return a validated decision dict.

    Parameters
    ----------
    snap : MarketSnapshot
        Current market and vault state.

    Returns
    -------
    dict
        Validated allocation decision.

    Raises
    ------
    DecisionValidationError
        If the LLM output fails constraint checks.
    json.JSONDecodeError
        If the LLM output is not valid JSON.
    """
    client = _get_client()
    user_prompt = build_user_prompt(snap)

    logger.info("Calling %s (max_tokens=%d)", LLM_MODEL, LLM_MAX_TOKENS)

    response = client.messages.create(
        model=LLM_MODEL,
        max_tokens=LLM_MAX_TOKENS,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_prompt}],
    )

    raw = response.content[0].text.strip()

    # Strip markdown fences if the model wrapped its output
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]

    decision = json.loads(raw.strip())
    decision = validate_decision(decision)

    logger.info(
        "Decision: action=%s usdc=%d eurc=%d usyc=%d conf=%.2f",
        decision["action"],
        decision["usdc_bps"],
        decision["eurc_bps"],
        decision["usyc_bps"],
        decision["confidence"],
    )

    return decision


# ─── CLI Entry Point ────────────────────────────────────────────────────────
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    # Quick test with a mock snapshot
    from skills.market_fetch.market_fetch import MarketSnapshot as MS

    mock_snap = MS(
        usdc_eurc_rate=1.082,
        usyc_nav_per_share=1.0037,
        usyc_apy_30d=4.48,
        ecb_rate=3.5,
        fed_rate=4.75,
        eur_usd_1w_implied_vol=5.2,
        depeg_alerts=[],
        vault_usdc=5000.0,
        vault_eurc=2000.0,
        vault_usyc_shares=3000.0,
        vault_total_aum_usdc=10000.0,
        owner_profile={
            "spending_currency": "USD",
            "secondary_currency": "EUR",
            "eur_spending_pct": 30,
            "monthly_outflow_usdc": 2000,
            "risk_tolerance": "moderate",
            "upcoming_payments": "none",
        },
    )
    result = call_llm(mock_snap)
    print(json.dumps(result, indent=2))
