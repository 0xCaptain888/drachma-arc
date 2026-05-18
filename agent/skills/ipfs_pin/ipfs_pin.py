"""
IPFS Pin Skill
==============
Pins the full decision payload and market context to IPFS via Pinata.
Returns a bytes32 CID hash suitable for on-chain storage.

Standalone module — can be invoked directly or via MuleRun skill trigger:
    "pin reasoning {decision} to IPFS"
"""

import os
import json
import time
import hashlib
import logging
from datetime import datetime, timezone
from typing import Optional

import httpx
from dotenv import load_dotenv

# Import MarketSnapshot type for annotations
try:
    from skills.market_fetch.market_fetch import MarketSnapshot
except ImportError:
    from agent.skills.market_fetch.market_fetch import MarketSnapshot  # type: ignore

load_dotenv()

logger = logging.getLogger("drachma.ipfs_pin")

# ─── Config ──────────────────────────────────────────────────────────────────
IPFS_ENDPOINT = os.getenv(
    "IPFS_ENDPOINT",
    "https://api.pinata.cloud/pinning/pinJSONToIPFS",
)
IPFS_JWT = os.getenv("IPFS_JWT")

AGENT_VERSION = "drachma-v2.0.0"
PIN_TIMEOUT   = int(os.getenv("IPFS_PIN_TIMEOUT", 30))


# ─── Payload Builder ────────────────────────────────────────────────────────
def _build_pin_payload(decision: dict, snap: MarketSnapshot) -> dict:
    """
    Build the Pinata-compatible JSON payload containing the full decision
    and market context for auditability.
    """
    return {
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
            "agent_version":  AGENT_VERSION,
        },
        "pinataMetadata": {
            "name": f"drachma-decision-{int(time.time())}",
        },
    }


# ─── CID to bytes32 ─────────────────────────────────────────────────────────
def cid_to_bytes32(cid: str) -> str:
    """
    Convert an IPFS CID string to a 0x-prefixed bytes32 hex string
    by taking the SHA-256 hash of the CID.
    """
    return "0x" + hashlib.sha256(cid.encode()).hexdigest()


# ─── Public Entry Point ─────────────────────────────────────────────────────
def pin_reasoning(
    decision: dict,
    snap: MarketSnapshot,
    dry_run: bool = False,
) -> str:
    """
    Pin the decision reasoning and market context to IPFS via Pinata.

    Parameters
    ----------
    decision : dict
        The validated LLM allocation decision.
    snap : MarketSnapshot
        Market snapshot used for the decision.
    dry_run : bool
        If True, build and log the payload but skip the actual pin.
        Returns a deterministic hash of the payload instead.

    Returns
    -------
    str
        0x-prefixed bytes32 hex string (SHA-256 of the IPFS CID).

    Raises
    ------
    httpx.HTTPStatusError
        If the Pinata API returns a non-2xx status.
    ValueError
        If IPFS_JWT is not configured and dry_run is False.
    """
    payload = _build_pin_payload(decision, snap)

    if dry_run:
        # Deterministic hash for testing without network calls
        payload_json = json.dumps(payload, sort_keys=True)
        fake_cid = "Qm" + hashlib.sha256(payload_json.encode()).hexdigest()[:44]
        logger.info("DRY RUN — skipping Pinata upload. Fake CID: %s", fake_cid)
        return cid_to_bytes32(fake_cid)

    if not IPFS_JWT:
        raise ValueError(
            "IPFS_JWT environment variable is required for pinning. "
            "Set it to your Pinata JWT token, or use dry_run=True."
        )

    logger.info("Pinning decision to IPFS via %s", IPFS_ENDPOINT)

    resp = httpx.post(
        IPFS_ENDPOINT,
        headers={
            "Authorization": f"Bearer {IPFS_JWT}",
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=PIN_TIMEOUT,
    )
    resp.raise_for_status()

    cid = resp.json()["IpfsHash"]
    bytes32 = cid_to_bytes32(cid)

    logger.info("Pinned successfully. CID: %s | bytes32: %s", cid, bytes32)
    return bytes32


# ─── Score Evidence Pinner ───────────────────────────────────────────────────
def pin_score_evidence(
    score_result: dict,
    vault_address: str,
    dry_run: bool = False,
) -> str:
    """
    Pin the weekly DrachmaScore evidence bundle to IPFS.

    Parameters
    ----------
    score_result : dict
        Output of calculate_and_update_score() or compute_score_components().
        Expected keys: score, components, weekly_stats (optional).
    vault_address : str
        Vault contract address for metadata.
    dry_run : bool
        If True, build and log the payload but skip the actual pin.

    Returns
    -------
    str
        0x-prefixed bytes32 hex string (SHA-256 of the IPFS CID).
    """
    payload = {
        "pinataContent": {
            "type":          "drachma_score_evidence",
            "vault":         vault_address,
            "score":         score_result.get("score"),
            "components":    score_result.get("components", {}),
            "weekly_stats":  score_result.get("weekly_stats", {}),
            "timestamp":     datetime.now(timezone.utc).isoformat(),
            "agent_version": AGENT_VERSION,
        },
        "pinataMetadata": {
            "name": f"drachma-score-evidence-{int(time.time())}",
        },
    }

    if dry_run:
        payload_json = json.dumps(payload, sort_keys=True)
        fake_cid = "Qm" + hashlib.sha256(payload_json.encode()).hexdigest()[:44]
        logger.info("DRY RUN — score evidence fake CID: %s", fake_cid)
        return cid_to_bytes32(fake_cid)

    if not IPFS_JWT:
        raise ValueError("IPFS_JWT environment variable is required for pinning.")

    logger.info("Pinning score evidence to IPFS")

    resp = httpx.post(
        IPFS_ENDPOINT,
        headers={
            "Authorization": f"Bearer {IPFS_JWT}",
            "Content-Type":  "application/json",
        },
        json=payload,
        timeout=PIN_TIMEOUT,
    )
    resp.raise_for_status()

    cid     = resp.json()["IpfsHash"]
    bytes32 = cid_to_bytes32(cid)
    logger.info("Score evidence pinned. CID: %s | bytes32: %s", cid, bytes32)
    return bytes32


# ─── Conversation Pinner ─────────────────────────────────────────────────────
def pin_conversation(
    conversation_history: list[dict],
    action_taken: Optional[str] = None,
    vault_address: Optional[str] = None,
    dry_run: bool = False,
) -> str:
    """
    Pin a conversation session transcript to IPFS for auditability.

    Parameters
    ----------
    conversation_history : list[dict]
        Anthropic-format message history [{"role": ..., "content": ...}].
    action_taken : str, optional
        Description of any on-chain action executed from the conversation.
    vault_address : str, optional
        Vault address for metadata.
    dry_run : bool
        If True, skip the actual pin and return a deterministic hash.

    Returns
    -------
    str
        0x-prefixed bytes32 hex string (SHA-256 of the IPFS CID).
    """
    payload = {
        "pinataContent": {
            "type":               "drachma_conversation",
            "vault":              vault_address or "unknown",
            "turn_count":         len(conversation_history),
            "history":            conversation_history,
            "action_taken":       action_taken,
            "timestamp":          datetime.now(timezone.utc).isoformat(),
            "agent_version":      AGENT_VERSION,
        },
        "pinataMetadata": {
            "name": f"drachma-conversation-{int(time.time())}",
        },
    }

    if dry_run:
        payload_json = json.dumps(payload, sort_keys=True, default=str)
        fake_cid = "Qm" + hashlib.sha256(payload_json.encode()).hexdigest()[:44]
        logger.info("DRY RUN — conversation fake CID: %s", fake_cid)
        return cid_to_bytes32(fake_cid)

    if not IPFS_JWT:
        raise ValueError("IPFS_JWT environment variable is required for pinning.")

    logger.info("Pinning conversation transcript to IPFS (%d turns)", len(conversation_history))

    resp = httpx.post(
        IPFS_ENDPOINT,
        headers={
            "Authorization": f"Bearer {IPFS_JWT}",
            "Content-Type":  "application/json",
        },
        json=payload,
        timeout=PIN_TIMEOUT,
    )
    resp.raise_for_status()

    cid     = resp.json()["IpfsHash"]
    bytes32 = cid_to_bytes32(cid)
    logger.info("Conversation pinned. CID: %s | bytes32: %s", cid, bytes32)
    return bytes32


# ─── CLI Entry Point ────────────────────────────────────────────────────────
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    # Quick dry-run test
    mock_decision = {
        "usdc_bps": 3500,
        "eurc_bps": 2500,
        "usyc_bps": 4000,
        "action": "rebalance",
        "confidence": 0.82,
        "reasoning": {
            "fx": "Test FX reasoning.",
            "yield": "Test yield reasoning.",
            "liquidity": "Test liquidity reasoning.",
            "risk": "Test risk reasoning.",
            "decision_summary": "Test summary.",
        },
        "expected_impact": {
            "annualized_yield_gain_usdc": 120.0,
            "fx_exposure_delta_pct": -2.5,
            "liquidity_change_usdc": -500.0,
        },
    }

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
        owner_profile={},
    )

    result = pin_reasoning(mock_decision, mock_snap, dry_run=True)
    print(f"bytes32: {result}")
