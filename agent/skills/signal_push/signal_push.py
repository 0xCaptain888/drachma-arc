"""
Signal Push Skill
=================
Market anomaly detection and DrachmaSignalBus signal submission.

Detects anomalies in market snapshots by comparing current vs previous
state across five signal types:
  1 — EURC secondary market spread
  2 — StableFX liquidity spread
  3 — EURC depeg alert
  4 — USYC NAV deviation
  5 — Yield / rate anomaly

Submits medium+ severity signals to the on-chain DrachmaSignalBus and
reads back recent network-wide signals for consensus context.

Standalone module — trigger phrase: "check for market anomalies"
"""

import os
import json
import logging
from typing import Optional

from web3 import Web3
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("drachma.signal_push")

# ─── Config ──────────────────────────────────────────────────────────────────
ARC_RPC             = os.getenv("ARC_RPC_URL")
AGENT_PRIVATE_KEY   = os.getenv("AGENT_PRIVATE_KEY")
SIGNAL_BUS_ADDRESS  = os.getenv("SIGNAL_BUS_ADDRESS")

DEFAULT_GAS_SIGNAL  = int(os.getenv("GAS_SIGNAL", 200_000))
MAX_FEE_PER_GAS_GWEI  = os.getenv("MAX_FEE_PER_GAS_GWEI", "1")
MAX_PRIORITY_FEE_GWEI = os.getenv("MAX_PRIORITY_FEE_GWEI", "0.1")
TX_RECEIPT_TIMEOUT    = int(os.getenv("TX_RECEIPT_TIMEOUT", 30))

# Signal severity thresholds (basis points unless noted)
EURC_SPREAD_WARN_BPS    = int(os.getenv("EURC_SPREAD_WARN_BPS",    30))
EURC_SPREAD_CRIT_BPS    = int(os.getenv("EURC_SPREAD_CRIT_BPS",    80))
STABLFX_SPREAD_WARN_BPS = int(os.getenv("STABLFX_SPREAD_WARN_BPS", 50))
STABLFX_SPREAD_CRIT_BPS = int(os.getenv("STABLFX_SPREAD_CRIT_BPS", 120))
USYC_NAV_DEVIATION_BPS  = int(os.getenv("USYC_NAV_DEVIATION_BPS",  20))
YIELD_JUMP_BPS          = int(os.getenv("YIELD_JUMP_BPS",          50))

# DrachmaSignalBus ABI
SIGNAL_BUS_ABI = json.loads(
    '['
    '{"name":"submitSignal","type":"function","inputs":['
    '{"name":"signalType","type":"uint8"},'
    '{"name":"valueBps","type":"int32"},'
    '{"name":"severity","type":"uint8"}'
    '],"outputs":[]},'
    '{"name":"getRecentSignals","type":"function","stateMutability":"view","inputs":['
    '{"name":"count","type":"uint256"}'
    '],"outputs":['
    '{"name":"","type":"tuple[]","components":['
    '{"name":"signalType","type":"uint8"},'
    '{"name":"valueBps","type":"int32"},'
    '{"name":"severity","type":"uint8"},'
    '{"name":"submitter","type":"address"},'
    '{"name":"timestamp","type":"uint256"}'
    ']}'
    ']}'
    ']'
)

# Signal type constants
SIG_EURC_SPREAD    = 1
SIG_STABLFX_SPREAD = 2
SIG_EURC_DEPEG     = 3
SIG_USYC_NAV       = 4
SIG_YIELD_ANOMALY  = 5

# Severity levels
SEV_LOW    = 1
SEV_MEDIUM = 2
SEV_HIGH   = 3
SEV_CRIT   = 4

_w3 = None


def _get_web3(w3_override: Optional[Web3] = None) -> Web3:
    """Return the provided Web3 instance, or lazy-init a module-level one."""
    if w3_override is not None:
        return w3_override
    global _w3
    if _w3 is None:
        if not ARC_RPC:
            raise ValueError("ARC_RPC_URL environment variable is required")
        _w3 = Web3(Web3.HTTPProvider(ARC_RPC))
    return _w3


def _get_bus_contract(w3: Web3, bus_address: Optional[str] = None):
    """Get a Web3 contract instance for the DrachmaSignalBus."""
    address = bus_address or SIGNAL_BUS_ADDRESS
    if not address:
        raise ValueError("SIGNAL_BUS_ADDRESS environment variable is required")
    return w3.eth.contract(
        address=Web3.to_checksum_address(address),
        abi=SIGNAL_BUS_ABI,
    )


# ─── Anomaly Detection ───────────────────────────────────────────────────────
def detect_anomalies(current: dict, previous: dict) -> list[dict]:
    """
    Compare current vs previous market snapshot dicts and return a list of
    detected anomalies, each formatted as a signal dict ready for push_signals.

    Parameters
    ----------
    current : dict
        Current MarketSnapshot fields as a plain dict.
    previous : dict
        Previous MarketSnapshot fields as a plain dict.

    Returns
    -------
    list[dict]
        Each item: {"signal_type": int, "value_bps": int, "severity": int,
                    "description": str}
    """
    anomalies = []

    # ── 1. EURC secondary market spread ─────────────────────────────────────
    eurc_spread = current.get("eurc_secondary_spread_bps", 0) or 0
    if eurc_spread >= EURC_SPREAD_CRIT_BPS:
        severity = SEV_CRIT
    elif eurc_spread >= EURC_SPREAD_WARN_BPS:
        severity = SEV_HIGH
    else:
        severity = 0

    if severity:
        anomalies.append({
            "signal_type": SIG_EURC_SPREAD,
            "value_bps":   eurc_spread,
            "severity":    severity,
            "description": f"EURC secondary spread {eurc_spread}bps",
        })

    # ── 2. StableFX liquidity spread ────────────────────────────────────────
    stablfx_spread = current.get("stablfx_spread_bps", 0) or 0
    if stablfx_spread >= STABLFX_SPREAD_CRIT_BPS:
        severity = SEV_CRIT
    elif stablfx_spread >= STABLFX_SPREAD_WARN_BPS:
        severity = SEV_HIGH
    else:
        severity = 0

    if severity:
        anomalies.append({
            "signal_type": SIG_STABLFX_SPREAD,
            "value_bps":   stablfx_spread,
            "severity":    severity,
            "description": f"StableFX spread {stablfx_spread}bps",
        })

    # ── 3. EURC depeg alert ──────────────────────────────────────────────────
    depeg_alerts = current.get("depeg_alerts", [])
    if depeg_alerts:
        # Use the first alert; value_bps is a rough 50bps default signal
        anomalies.append({
            "signal_type": SIG_EURC_DEPEG,
            "value_bps":   50,
            "severity":    SEV_CRIT,
            "description": f"Depeg alert: {depeg_alerts[0]}",
        })

    # ── 4. USYC NAV deviation ────────────────────────────────────────────────
    prev_nav = previous.get("usyc_nav_per_share", 0) or 0
    curr_nav = current.get("usyc_nav_per_share", 0) or 0
    if prev_nav > 0 and curr_nav > 0:
        nav_delta_bps = int(abs(curr_nav - prev_nav) / prev_nav * 10000)
        if nav_delta_bps >= USYC_NAV_DEVIATION_BPS:
            severity = SEV_HIGH if nav_delta_bps >= USYC_NAV_DEVIATION_BPS * 2 else SEV_MEDIUM
            anomalies.append({
                "signal_type": SIG_USYC_NAV,
                "value_bps":   nav_delta_bps,
                "severity":    severity,
                "description": f"USYC NAV moved {nav_delta_bps}bps (prev={prev_nav:.6f} curr={curr_nav:.6f})",
            })

    # ── 5. Yield / rate anomaly ──────────────────────────────────────────────
    prev_apy = previous.get("usyc_apy_30d", 0) or 0
    curr_apy = current.get("usyc_apy_30d", 0) or 0
    if prev_apy > 0 and curr_apy > 0:
        apy_delta_bps = int(abs(curr_apy - prev_apy) * 100)
        if apy_delta_bps >= YIELD_JUMP_BPS:
            anomalies.append({
                "signal_type": SIG_YIELD_ANOMALY,
                "value_bps":   apy_delta_bps,
                "severity":    SEV_MEDIUM,
                "description": f"USYC APY jump {apy_delta_bps}bps (prev={prev_apy:.2f}% curr={curr_apy:.2f}%)",
            })

    if anomalies:
        logger.info("Detected %d anomal%s", len(anomalies), "y" if len(anomalies) == 1 else "ies")
        for a in anomalies:
            logger.info("  [sig=%d sev=%d] %s", a["signal_type"], a["severity"], a["description"])

    return anomalies


# ─── Signal Push ────────────────────────────────────────────────────────────
def push_signals(
    anomalies: list[dict],
    w3: Optional[Web3] = None,
    private_key: Optional[str] = None,
    bus_address: Optional[str] = None,
    min_severity: int = SEV_MEDIUM,
    dry_run: bool = False,
) -> list[str]:
    """
    Submit anomaly signals with severity >= min_severity to the on-chain
    DrachmaSignalBus.

    Parameters
    ----------
    anomalies : list[dict]
        Output of detect_anomalies().
    w3 : Web3, optional
        Web3 instance (falls back to module-level lazy-init).
    private_key : str, optional
        Agent private key (falls back to AGENT_PRIVATE_KEY env var).
    bus_address : str, optional
        Signal bus contract address (falls back to SIGNAL_BUS_ADDRESS env var).
    min_severity : int
        Only push signals with severity >= this value. Default: SEV_MEDIUM (2).
    dry_run : bool
        If True, log what would be submitted but do not broadcast.

    Returns
    -------
    list[str]
        Transaction hash hex strings for each submitted signal.
    """
    to_push = [a for a in anomalies if a.get("severity", 0) >= min_severity]
    if not to_push:
        logger.info("No signals meet min_severity=%d — nothing to push", min_severity)
        return []

    if dry_run:
        for a in to_push:
            logger.info("DRY RUN — would push: %s", a)
        return []

    web3 = _get_web3(w3)
    key  = private_key or AGENT_PRIVATE_KEY
    if not key:
        raise ValueError("AGENT_PRIVATE_KEY required to push signals")

    account = web3.eth.account.from_key(key)
    bus     = _get_bus_contract(web3, bus_address)

    tx_hashes = []
    for sig in to_push:
        try:
            base_tx = {
                "from":                 account.address,
                "nonce":                web3.eth.get_transaction_count(account.address),
                "gas":                  DEFAULT_GAS_SIGNAL,
                "maxFeePerGas":         web3.to_wei(MAX_FEE_PER_GAS_GWEI, "gwei"),
                "maxPriorityFeePerGas": web3.to_wei(MAX_PRIORITY_FEE_GWEI, "gwei"),
            }
            tx = bus.functions.submitSignal(
                sig["signal_type"],
                sig["value_bps"],
                sig["severity"],
            ).build_transaction(base_tx)

            signed   = web3.eth.account.sign_transaction(tx, key)
            tx_hash  = web3.eth.send_raw_transaction(signed.raw_transaction)
            receipt  = web3.eth.wait_for_transaction_receipt(tx_hash, timeout=TX_RECEIPT_TIMEOUT)
            tx_hex   = tx_hash.hex()
            tx_hashes.append(tx_hex)

            logger.info(
                "Signal submitted: type=%d value=%dbps sev=%d | tx=%s block=%s",
                sig["signal_type"], sig["value_bps"], sig["severity"],
                tx_hex, receipt.get("blockNumber"),
            )
        except Exception as e:
            logger.error("Failed to push signal type=%d: %s", sig.get("signal_type"), e)

    return tx_hashes


# ─── Network Signal Reader ───────────────────────────────────────────────────
def read_network_signals(
    count: int = 20,
    w3: Optional[Web3] = None,
    bus_address: Optional[str] = None,
) -> list[dict]:
    """
    Read the most recent signals from DrachmaSignalBus for consensus context.

    Parameters
    ----------
    count : int
        Number of recent signals to fetch (default 20).
    w3 : Web3, optional
        Web3 instance (falls back to module-level lazy-init).
    bus_address : str, optional
        Signal bus contract address (falls back to SIGNAL_BUS_ADDRESS env var).

    Returns
    -------
    list[dict]
        Each item: {"signal_type", "value_bps", "severity", "submitter", "timestamp"}
    """
    web3 = _get_web3(w3)
    bus  = _get_bus_contract(web3, bus_address)

    try:
        raw_signals = bus.functions.getRecentSignals(count).call()
        result = []
        for s in raw_signals:
            result.append({
                "signal_type": s[0],
                "value_bps":   s[1],
                "severity":    s[2],
                "submitter":   s[3],
                "timestamp":   s[4],
            })
        logger.info("Fetched %d network signal(s)", len(result))
        return result
    except Exception as e:
        logger.error("Failed to read network signals: %s", e)
        return []


# ─── CLI Entry Point ────────────────────────────────────────────────────────
if __name__ == "__main__":
    import logging as _logging
    _logging.basicConfig(level=_logging.INFO)

    mock_current = {
        "eurc_secondary_spread_bps": 45,
        "stablfx_spread_bps": 65,
        "depeg_alerts": [],
        "usyc_nav_per_share": 1.00395,
        "usyc_apy_30d": 4.95,
    }
    mock_previous = {
        "eurc_secondary_spread_bps": 10,
        "stablfx_spread_bps": 12,
        "depeg_alerts": [],
        "usyc_nav_per_share": 1.00370,
        "usyc_apy_30d": 4.48,
    }

    detected = detect_anomalies(mock_current, mock_previous)
    print(f"Detected {len(detected)} anomaly/anomalies:")
    for a in detected:
        print(f"  {a}")

    print("\nDry-run push:")
    push_signals(detected, dry_run=True)
