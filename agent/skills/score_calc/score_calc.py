"""
Score Calc Skill
================
Weekly DrachmaScore computation and on-chain update via DrachmaScoreOracle.

The DrachmaScore (0–1000) is a composite metric across four dimensions:

  1. Yield Performance   (0–300): Achieved yield vs USYC benchmark
  2. Band Discipline     (0–250): Time within allocation bands; penalty for violations
  3. Risk Response       (0–250): Speed and quality of emergency signal response
  4. Consistency         (0–200): Rebalance frequency regularity and uptime

After computing the score, this skill pins the evidence bundle to IPFS
and submits the score + CID to the DrachmaScoreOracle contract on-chain.

Standalone module — trigger phrases: "calculate score", "update drachma score"
"""

import json
import logging
import time
from datetime import datetime, timezone
from typing import Optional

from web3 import Web3
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("drachma.score_calc")

# ─── Score Oracle ABI ────────────────────────────────────────────────────────
SCORE_ORACLE_ABI = json.loads(
    '['
    '{"name":"updateScore","type":"function","inputs":['
    '{"name":"vault","type":"address"},'
    '{"name":"score","type":"uint16"},'
    '{"name":"evidenceCID","type":"bytes32"},'
    '{"name":"components","type":"uint16[4]"}'
    '],"outputs":[]},'
    '{"name":"getScore","type":"function","stateMutability":"view","inputs":['
    '{"name":"vault","type":"address"}'
    '],"outputs":['
    '{"name":"score","type":"uint16"},'
    '{"name":"lastUpdated","type":"uint256"}'
    ']}'
    ']'
)

# Scoring weights (must sum to 1000)
WEIGHT_YIELD       = 300
WEIGHT_BAND        = 250
WEIGHT_RISK        = 250
WEIGHT_CONSISTENCY = 200

# Gas settings
DEFAULT_GAS_SCORE      = 250_000
MAX_FEE_PER_GAS_GWEI   = "1"
MAX_PRIORITY_FEE_GWEI  = "0.1"
TX_RECEIPT_TIMEOUT     = 30


# ─── Score Components ────────────────────────────────────────────────────────
def compute_score_components(
    weekly_stats: dict,
) -> dict:
    """
    Compute the four DrachmaScore components from a weekly statistics bundle.

    Parameters
    ----------
    weekly_stats : dict
        Expected keys:
          yield_achieved_pct      : float  — actual annualized yield achieved
          benchmark_yield_pct     : float  — USYC 30d APY as benchmark
          band_violation_hours    : float  — hours any allocation was outside bands
          total_hours             : float  — total hours in the week (168)
          emergency_signals_count : int    — number of emergency signals received
          emergency_responses_ok  : int    — number responded to within 5 minutes
          rebalances_expected     : int    — expected rebalance count for the week
          rebalances_actual       : int    — actual rebalances executed
          uptime_pct              : float  — agent uptime percentage (0-100)

    Returns
    -------
    dict
        {"yield": int, "band": int, "risk": int, "consistency": int, "total": int}
        where each value is in [0, WEIGHT_*].
    """
    # ── 1. Yield Performance ─────────────────────────────────────────────────
    achieved  = weekly_stats.get("yield_achieved_pct", 0.0)
    benchmark = weekly_stats.get("benchmark_yield_pct", 4.5)
    if benchmark > 0:
        yield_ratio = min(achieved / benchmark, 1.2)  # cap at 120% of benchmark
    else:
        yield_ratio = 0.0
    yield_score = int(WEIGHT_YIELD * min(yield_ratio, 1.0))

    # ── 2. Band Discipline ───────────────────────────────────────────────────
    violation_hours = weekly_stats.get("band_violation_hours", 0.0)
    total_hours     = weekly_stats.get("total_hours", 168.0)
    if total_hours > 0:
        discipline_ratio = max(0.0, 1.0 - (violation_hours / total_hours))
    else:
        discipline_ratio = 0.0
    band_score = int(WEIGHT_BAND * discipline_ratio)

    # ── 3. Risk Response ────────────────────────────────────────────────────
    signals_count = weekly_stats.get("emergency_signals_count", 0)
    responses_ok  = weekly_stats.get("emergency_responses_ok", 0)
    if signals_count > 0:
        risk_ratio = responses_ok / signals_count
    else:
        # No signals — perfect score (nothing to respond to)
        risk_ratio = 1.0
    risk_score = int(WEIGHT_RISK * risk_ratio)

    # ── 4. Consistency ───────────────────────────────────────────────────────
    expected = weekly_stats.get("rebalances_expected", 7)   # ~1/day default
    actual   = weekly_stats.get("rebalances_actual", 0)
    uptime   = weekly_stats.get("uptime_pct", 100.0) / 100.0

    if expected > 0:
        rebalance_ratio = min(actual / expected, 1.0)
    else:
        rebalance_ratio = 1.0
    consistency_score = int(WEIGHT_CONSISTENCY * ((rebalance_ratio * 0.6) + (uptime * 0.4)))

    total = yield_score + band_score + risk_score + consistency_score

    logger.info(
        "[Score] yield=%d band=%d risk=%d consistency=%d total=%d/1000",
        yield_score, band_score, risk_score, consistency_score, total,
    )

    return {
        "yield":       yield_score,
        "band":        band_score,
        "risk":        risk_score,
        "consistency": consistency_score,
        "total":       total,
    }


# ─── On-Chain Update ─────────────────────────────────────────────────────────
async def calculate_and_update_score(
    vault_address: str,
    agent_key: str,
    score_oracle_addr: str,
    w3: Web3,
    ipfs_jwt: Optional[str] = None,
    weekly_stats: Optional[dict] = None,
    dry_run: bool = False,
) -> dict:
    """
    Compute DrachmaScore from weekly_stats, pin evidence to IPFS,
    and submit the score to DrachmaScoreOracle on-chain.

    Parameters
    ----------
    vault_address : str
        Vault contract address (used as identifier in the oracle).
    agent_key : str
        Agent private key for signing the update transaction.
    score_oracle_addr : str
        DrachmaScoreOracle contract address.
    w3 : Web3
        Initialized Web3 instance.
    ipfs_jwt : str, optional
        Pinata JWT for IPFS pinning. If None, evidence is not pinned.
    weekly_stats : dict, optional
        Statistics bundle. If None, uses placeholder defaults (useful for
        first-run when no history exists yet).
    dry_run : bool
        If True, compute and log the score but do not submit on-chain.

    Returns
    -------
    dict
        {"score": int, "components": dict, "evidence_cid": str, "tx_hash": str}
    """
    import hashlib

    if weekly_stats is None:
        logger.warning("[Score] No weekly_stats provided — using defaults")
        weekly_stats = {
            "yield_achieved_pct":      4.5,
            "benchmark_yield_pct":     4.5,
            "band_violation_hours":    0.0,
            "total_hours":             168.0,
            "emergency_signals_count": 0,
            "emergency_responses_ok":  0,
            "rebalances_expected":     7,
            "rebalances_actual":       7,
            "uptime_pct":              100.0,
        }

    components = compute_score_components(weekly_stats)
    total_score = components["total"]

    # ── Pin evidence to IPFS ─────────────────────────────────────────────────
    evidence_cid = "0x" + "0" * 64  # fallback zero CID

    if ipfs_jwt:
        try:
            import httpx
            evidence_payload = {
                "pinataContent": {
                    "vault":       vault_address,
                    "score":       total_score,
                    "components":  components,
                    "weekly_stats": weekly_stats,
                    "timestamp":   datetime.now(timezone.utc).isoformat(),
                    "agent":       "drachma-v2",
                },
                "pinataMetadata": {
                    "name": f"drachma-score-{int(time.time())}",
                },
            }
            resp = httpx.post(
                "https://api.pinata.cloud/pinning/pinJSONToIPFS",
                headers={
                    "Authorization": f"Bearer {ipfs_jwt}",
                    "Content-Type": "application/json",
                },
                json=evidence_payload,
                timeout=30,
            )
            resp.raise_for_status()
            cid_str    = resp.json()["IpfsHash"]
            evidence_cid = "0x" + hashlib.sha256(cid_str.encode()).hexdigest()
            logger.info("[Score] Evidence pinned. CID: %s | bytes32: %s", cid_str, evidence_cid)
        except Exception as e:
            logger.error("[Score] IPFS pin failed: %s — using zero CID", e)

    if dry_run:
        logger.info("[Score] DRY RUN — score=%d (not submitted)", total_score)
        return {
            "score":        total_score,
            "components":   components,
            "evidence_cid": evidence_cid,
            "tx_hash":      None,
        }

    # ── Submit to DrachmaScoreOracle ─────────────────────────────────────────
    if not score_oracle_addr:
        logger.warning("[Score] SCORE_ORACLE_ADDRESS not set — skipping on-chain update")
        return {
            "score":        total_score,
            "components":   components,
            "evidence_cid": evidence_cid,
            "tx_hash":      None,
        }

    try:
        oracle = w3.eth.contract(
            address=Web3.to_checksum_address(score_oracle_addr),
            abi=SCORE_ORACLE_ABI,
        )
        account = w3.eth.account.from_key(agent_key)

        cid_bytes = bytes.fromhex(evidence_cid[2:])
        components_arr = [
            components["yield"],
            components["band"],
            components["risk"],
            components["consistency"],
        ]

        base_tx = {
            "from":                 account.address,
            "nonce":                w3.eth.get_transaction_count(account.address),
            "gas":                  DEFAULT_GAS_SCORE,
            "maxFeePerGas":         w3.to_wei(MAX_FEE_PER_GAS_GWEI, "gwei"),
            "maxPriorityFeePerGas": w3.to_wei(MAX_PRIORITY_FEE_GWEI, "gwei"),
        }
        tx = oracle.functions.updateScore(
            Web3.to_checksum_address(vault_address),
            total_score,
            cid_bytes,
            components_arr,
        ).build_transaction(base_tx)

        signed  = w3.eth.account.sign_transaction(tx, agent_key)
        tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=TX_RECEIPT_TIMEOUT)
        tx_hex  = tx_hash.hex()

        logger.info(
            "[Score] On-chain update confirmed. Score=%d tx=%s block=%s",
            total_score, tx_hex, receipt.get("blockNumber"),
        )

        return {
            "score":        total_score,
            "components":   components,
            "evidence_cid": evidence_cid,
            "tx_hash":      tx_hex,
        }

    except Exception as e:
        logger.error("[Score] On-chain score update failed: %s", e, exc_info=True)
        return {
            "score":        total_score,
            "components":   components,
            "evidence_cid": evidence_cid,
            "tx_hash":      None,
        }


# ─── CLI Entry Point ────────────────────────────────────────────────────────
if __name__ == "__main__":
    import logging as _logging
    _logging.basicConfig(level=_logging.INFO)

    mock_stats = {
        "yield_achieved_pct":      4.62,
        "benchmark_yield_pct":     4.48,
        "band_violation_hours":    2.5,
        "total_hours":             168.0,
        "emergency_signals_count": 1,
        "emergency_responses_ok":  1,
        "rebalances_expected":     7,
        "rebalances_actual":       6,
        "uptime_pct":              99.8,
    }

    result = compute_score_components(mock_stats)
    print(json.dumps(result, indent=2))
