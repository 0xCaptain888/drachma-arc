"""
Conversation Skill
==================
Natural language treasury interface for Drachma vault owners.

Provides a multi-turn conversational interface powered by Claude that lets
vault owners:
  - Query current vault state and recent decisions
  - Adjust risk tolerance, spending profile, and allocation preferences
  - Request an immediate rebalance analysis
  - Approve or override a pending decision
  - Get plain-English explanations of recent LLM decisions

The conversation maintains a session history list and resolves owner intents
into structured actions. When the owner approves a rebalance or override,
execute_vault_update() handles the on-chain transaction.

Standalone module — trigger phrase: "talk to my vault"
"""

import json
import logging
import os
from datetime import datetime, timezone
from typing import Optional

import anthropic
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("drachma.conversation")

# ─── Config ──────────────────────────────────────────────────────────────────
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
LLM_MODEL         = os.getenv("LLM_MODEL", "claude-sonnet-4-20250514")
LLM_MAX_TOKENS    = int(os.getenv("LLM_MAX_TOKENS_CONV", 2048))

_client: Optional[anthropic.Anthropic] = None


def _get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    return _client


# ─── Conversation System Prompt ──────────────────────────────────────────────
CONVERSATION_SYSTEM = """
You are Drachma, an autonomous stablecoin reserve manager and personal treasury
assistant. You manage a vault on Arc (Circle's L1) holding USDC, EURC, and USYC.

Your role in this conversation is to act as a knowledgeable, concise, and helpful
advisor to the vault owner. You have access to the current vault state and recent
decision history provided in each user message.

CAPABILITIES YOU CAN PERFORM (via structured JSON response):
1. Answer questions about vault state, recent decisions, market conditions.
2. Update owner profile preferences (risk_tolerance, eur_spending_pct, etc.).
3. Trigger an immediate rebalance analysis.
4. Confirm or reject a pending override request.
5. Explain any past decision in plain English.

RESPONSE FORMAT:
Always respond with a JSON object containing:
{
  "message": "<conversational reply to the owner — 1-4 sentences, friendly>",
  "intent": "inform" | "update_profile" | "trigger_analysis" | "execute_override" | "explain_decision",
  "action": null | {
    "type": "update_profile",
    "changes": { "<field>": <value>, ... }
  } | {
    "type": "trigger_analysis"
  } | {
    "type": "execute_override",
    "usdc_bps": <int>,
    "eurc_bps": <int>,
    "usyc_bps": <int>,
    "reason": "<string>"
  }
}

CONSTRAINTS:
- Never suggest allocations outside the hardcoded bands (USDC 20-60%, EURC 10-40%, USYC 20-60%).
- Be concise. Owners are busy — no fluff.
- When discussing yield, always state both the rate and its risk context.
- If the owner asks for something outside your capabilities, politely explain what you can do.
"""


# ─── Context Builder ─────────────────────────────────────────────────────────
def _build_context_block(
    vault_state: Optional[dict],
    owner_profile: dict,
    recent_decisions: Optional[list],
) -> str:
    """Build the context header injected at the start of each user message."""
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    lines = [f"[Context as of {ts}]"]

    if vault_state:
        lines.append(
            f"Vault AUM: ${vault_state.get('total_aum', 0):,.2f} | "
            f"USDC {vault_state.get('usdc_pct', 0):.1f}% | "
            f"EURC {vault_state.get('eurc_pct', 0):.1f}% | "
            f"USYC {vault_state.get('usyc_pct', 0):.1f}%"
        )

    if owner_profile:
        lines.append(
            f"Owner profile: risk={owner_profile.get('risk_tolerance', 'moderate')} | "
            f"EUR spending={owner_profile.get('eur_spending_pct', 30)}% | "
            f"monthly outflow=${owner_profile.get('monthly_outflow_usdc', 2000):,}"
        )

    if recent_decisions:
        last = recent_decisions[-1] if recent_decisions else None
        if last:
            lines.append(
                f"Last decision: {last.get('action', 'unknown')} | "
                f"conf={last.get('confidence', 0):.2f} | "
                f"{last.get('reasoning', {}).get('decision_summary', '')}"
            )

    return "\n".join(lines)


# ─── Public Entry Point ─────────────────────────────────────────────────────
def run_conversation(
    user_message: str,
    history: list[dict],
    vault_state: Optional[dict] = None,
    owner_profile: Optional[dict] = None,
    recent_decisions: Optional[list] = None,
) -> tuple[dict, list[dict]]:
    """
    Run one turn of the conversational treasury interface.

    Parameters
    ----------
    user_message : str
        The owner's plain-text message.
    history : list[dict]
        Message history in Anthropic format [{"role": ..., "content": ...}].
        Pass [] for a new session.
    vault_state : dict, optional
        Current vault balances (from fetch_vault_state()).
    owner_profile : dict, optional
        Owner preferences dict.
    recent_decisions : list, optional
        List of recent LLM decision dicts for context.

    Returns
    -------
    tuple (response_dict, updated_history)
        response_dict: parsed assistant JSON response
        updated_history: updated message list for the next turn
    """
    client = _get_client()

    context = _build_context_block(
        vault_state or {},
        owner_profile or {},
        recent_decisions or [],
    )
    full_user_msg = f"{context}\n\nOwner: {user_message}"

    updated_history = history + [{"role": "user", "content": full_user_msg}]

    response = client.messages.create(
        model=LLM_MODEL,
        max_tokens=LLM_MAX_TOKENS,
        system=CONVERSATION_SYSTEM,
        messages=updated_history,
    )

    raw = response.content[0].text.strip()

    # Strip markdown fences if present
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("Conversation LLM returned non-JSON — wrapping as inform")
        parsed = {
            "message": raw,
            "intent":  "inform",
            "action":  None,
        }

    updated_history = updated_history + [{"role": "assistant", "content": raw}]

    logger.info(
        "[Conversation] intent=%s action=%s",
        parsed.get("intent"), parsed.get("action", {}).get("type") if parsed.get("action") else None,
    )

    return parsed, updated_history


# ─── Vault Update Executor ───────────────────────────────────────────────────
def execute_vault_update(
    action: dict,
    w3,
    agent_key: str,
    vault_address: str,
    ipfs_jwt: Optional[str] = None,
) -> str:
    """
    Execute a vault action that came from the conversational interface.

    Parameters
    ----------
    action : dict
        Action dict from run_conversation() response (type="execute_override").
    w3 : Web3
        Initialized Web3 instance.
    agent_key : str
        Agent private key.
    vault_address : str
        Vault contract address.
    ipfs_jwt : str, optional
        Pinata JWT for IPFS pinning.

    Returns
    -------
    str
        Transaction hash, or descriptive string if no tx was needed.
    """
    try:
        from skills.arc_submit.arc_submit import submit_rebalance
        from skills.ipfs_pin.ipfs_pin import pin_reasoning
    except ImportError:
        from agent.skills.arc_submit.arc_submit import submit_rebalance  # type: ignore
        from agent.skills.ipfs_pin.ipfs_pin import pin_reasoning          # type: ignore

    action_type = action.get("type")

    if action_type == "execute_override":
        decision = {
            "action":   "rebalance",
            "usdc_bps": action["usdc_bps"],
            "eurc_bps": action["eurc_bps"],
            "usyc_bps": action["usyc_bps"],
            "confidence": 1.0,
            "reasoning": {
                "fx":               "Owner-directed override.",
                "yield":            "Owner-directed override.",
                "liquidity":        "Owner-directed override.",
                "risk":             "Owner-directed override.",
                "decision_summary": action.get("reason", "Manual override via conversation."),
            },
            "expected_impact": {
                "annualized_yield_gain_usdc": 0.0,
                "fx_exposure_delta_pct":      0.0,
                "liquidity_change_usdc":      0.0,
            },
        }

        # Minimal snap-like object for pin_reasoning
        class _MinimalSnap:
            def __init__(self):
                self.usdc_eurc_rate         = 1.08
                self.usyc_apy_30d           = 4.5
                self.ecb_rate               = 3.5
                self.fed_rate               = 4.75
                self.eur_usd_1w_implied_vol = 5.2
                self.depeg_alerts           = []
                self.vault_total_aum_usdc   = 0.0

        snap = _MinimalSnap()
        dry_run = ipfs_jwt is None
        cid = pin_reasoning(decision, snap, dry_run=dry_run)

        tx_hash = submit_rebalance(
            decision=decision,
            cid_bytes32=cid,
            vault_address=vault_address,
            private_key=agent_key,
            w3=w3,
        )

        logger.info("[Conversation] Override executed. TX: %s", tx_hash)
        return tx_hash

    elif action_type == "trigger_analysis":
        logger.info("[Conversation] Analysis trigger requested — caller must invoke run_decision_cycle()")
        return "analysis_triggered"

    else:
        logger.info("[Conversation] No executable action for type=%s", action_type)
        return "no_action"


# ─── CLI Entry Point ────────────────────────────────────────────────────────
if __name__ == "__main__":
    import logging as _logging
    _logging.basicConfig(level=_logging.INFO)

    mock_vault = {
        "usdc": 3500.0, "eurc": 2000.0, "usyc_shares": 4500.0,
        "total_aum": 10000.0, "usdc_pct": 35.0, "eurc_pct": 20.0, "usyc_pct": 45.0,
    }
    mock_profile = {
        "spending_currency": "USD", "secondary_currency": "EUR",
        "eur_spending_pct": 35, "monthly_outflow_usdc": 3000,
        "risk_tolerance": "moderate", "upcoming_payments": "none",
    }

    history = []
    while True:
        try:
            msg = input("\nYou: ").strip()
            if not msg or msg.lower() in ("exit", "quit"):
                break
            resp, history = run_conversation(
                msg, history,
                vault_state=mock_vault,
                owner_profile=mock_profile,
            )
            print(f"\nDrachma: {resp['message']}")
            if resp.get("action"):
                print(f"  [Action: {resp['action']}]")
        except KeyboardInterrupt:
            break
