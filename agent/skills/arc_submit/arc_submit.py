"""
Arc Submit Skill — v2
=====================
Builds, signs, and submits rebalance() or emergencyExit() transactions
to the Drachma vault on Arc (Circle's L1) via Web3.

v2 changes:
  - rebalance() ABI extended with triggerType and networkSignalValue params
  - submit_emergency_exit() is a standalone function (not a branch of submit_rebalance)
  - updateNav() is called after a successful rebalance to update on-chain NAV
  - submit_rebalance accepts w3 as a direct parameter (agent passes it in)

Standalone module — trigger phrase: "submit rebalance tx for {decision}"
"""

import os
import json
import logging
from typing import Optional

from web3 import Web3
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("drachma.arc_submit")

# ─── Config ──────────────────────────────────────────────────────────────────
ARC_RPC           = os.getenv("ARC_RPC_URL")
VAULT_ADDRESS     = os.getenv("VAULT_ADDRESS")
AGENT_PRIVATE_KEY = os.getenv("AGENT_PRIVATE_KEY")

# Gas defaults (override via env for mainnet tuning)
DEFAULT_GAS_REBALANCE = int(os.getenv("GAS_REBALANCE", 700_000))
DEFAULT_GAS_EMERGENCY = int(os.getenv("GAS_EMERGENCY", 500_000))
DEFAULT_GAS_NAV       = int(os.getenv("GAS_NAV", 150_000))
MAX_FEE_PER_GAS_GWEI  = os.getenv("MAX_FEE_PER_GAS_GWEI", "1")
MAX_PRIORITY_FEE_GWEI = os.getenv("MAX_PRIORITY_FEE_GWEI", "0.1")
TX_RECEIPT_TIMEOUT    = int(os.getenv("TX_RECEIPT_TIMEOUT", 30))

# Vault ABI v2 — rebalance (with triggerType + networkSignalValue), emergencyExit,
# updateNav, and totalAum view function
VAULT_ABI = json.loads(
    '['
    '{"name":"rebalance","type":"function","inputs":['
    '{"name":"targetUsdcBps","type":"uint16"},'
    '{"name":"targetEurcBps","type":"uint16"},'
    '{"name":"targetUsycBps","type":"uint16"},'
    '{"name":"reasoningCID","type":"bytes32"},'
    '{"name":"minUsdcOut","type":"uint256"},'
    '{"name":"triggerType","type":"uint8"},'
    '{"name":"networkSignalValue","type":"int32"}'
    '],"outputs":[]},'
    '{"name":"emergencyExit","type":"function","inputs":['
    '{"name":"reasoningCID","type":"bytes32"}'
    '],"outputs":[]},'
    '{"name":"updateNav","type":"function","inputs":['
    '{"name":"newNavPerShare","type":"uint256"}'
    '],"outputs":[]},'
    '{"name":"totalAum","type":"function","stateMutability":"view",'
    '"inputs":[],"outputs":['
    '{"name":"usdc","type":"uint256"},'
    '{"name":"eurc","type":"uint256"},'
    '{"name":"usyc","type":"uint256"},'
    '{"name":"totalInUsdc","type":"uint256"}'
    ']}'
    ']'
)

# Trigger type constants (matches on-chain enum)
TRIGGER_SCHEDULED  = 0
TRIGGER_CONSENSUS  = 1
TRIGGER_STABLFX    = 2
TRIGGER_MACRO      = 3
TRIGGER_MANUAL     = 4

_w3 = None


def _get_web3(w3_override: Optional[Web3] = None) -> Web3:
    """Return provided Web3 instance or lazy-init a module-level one."""
    if w3_override is not None:
        return w3_override
    global _w3
    if _w3 is None:
        if not ARC_RPC:
            raise ValueError("ARC_RPC_URL environment variable is required")
        _w3 = Web3(Web3.HTTPProvider(ARC_RPC))
    return _w3


def _get_vault_contract(w3: Web3, vault_address: Optional[str] = None):
    """Get a Web3 contract instance for the vault."""
    address = vault_address or VAULT_ADDRESS
    if not address:
        raise ValueError("VAULT_ADDRESS environment variable is required")
    return w3.eth.contract(
        address=Web3.to_checksum_address(address),
        abi=VAULT_ABI,
    )


def _build_base_tx(w3: Web3, account_address: str, gas: int) -> dict:
    """Build the base transaction dict with nonce, gas, and fee params."""
    return {
        "from":                 account_address,
        "nonce":                w3.eth.get_transaction_count(account_address),
        "gas":                  gas,
        "maxFeePerGas":         w3.to_wei(MAX_FEE_PER_GAS_GWEI, "gwei"),
        "maxPriorityFeePerGas": w3.to_wei(MAX_PRIORITY_FEE_GWEI, "gwei"),
    }


def _broadcast(w3: Web3, tx: dict, key: str, dry_run: bool) -> str:
    """Sign, optionally broadcast, and return the transaction hash hex."""
    signed = w3.eth.account.sign_transaction(tx, key)
    tx_hash_hex = signed.hash.hex()

    if dry_run:
        logger.info("DRY RUN — signed tx hash: %s (not broadcast)", tx_hash_hex)
        return tx_hash_hex

    logger.info("Broadcasting transaction...")
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=TX_RECEIPT_TIMEOUT)

    final_hash = tx_hash.hex()
    logger.info(
        "Transaction confirmed. Hash: %s | Block: %s | Gas used: %s",
        final_hash,
        receipt.get("blockNumber"),
        receipt.get("gasUsed"),
    )
    return final_hash


# ─── Public Entry Points ─────────────────────────────────────────────────────
def submit_rebalance(
    decision: dict,
    cid_bytes32: str,
    w3: Optional[Web3] = None,
    private_key: Optional[str] = None,
    vault_address: Optional[str] = None,
    min_usdc_out: int = 0,
    trigger_type: int = TRIGGER_SCHEDULED,
    network_signal_value: int = 0,
    dry_run: bool = False,
) -> str:
    """
    Build, sign, and submit a rebalance transaction to Arc (v2 ABI).

    Parameters
    ----------
    decision : dict
        Validated LLM decision with keys: action, usdc_bps, eurc_bps, usyc_bps.
    cid_bytes32 : str
        0x-prefixed bytes32 hex string of the IPFS reasoning CID hash.
    w3 : Web3, optional
        Web3 instance (falls back to module-level lazy-init).
    private_key : str, optional
        Override agent private key (defaults to AGENT_PRIVATE_KEY env var).
    vault_address : str, optional
        Override vault contract address (defaults to VAULT_ADDRESS env var).
    min_usdc_out : int
        Minimum USDC output for slippage protection (default 0).
    trigger_type : int
        On-chain trigger classification (TRIGGER_* constants, default SCHEDULED=0).
    network_signal_value : int
        Consensus signal value in bps (default 0 for non-consensus triggers).
    dry_run : bool
        If True, build and sign but do not broadcast. Returns signed tx hash.

    Returns
    -------
    str
        Transaction hash hex string, or "hold — no tx submitted" for hold actions.
    """
    action = decision.get("action", "hold")

    if action == "hold":
        logger.info("Action is 'hold' — no transaction submitted")
        return "hold — no tx submitted"

    if action == "emergency_exit":
        return submit_emergency_exit(
            cid_bytes32=cid_bytes32,
            w3=w3,
            private_key=private_key,
            vault_address=vault_address,
            dry_run=dry_run,
        )

    web3 = _get_web3(w3)
    key  = private_key or AGENT_PRIVATE_KEY
    if not key:
        raise ValueError("AGENT_PRIVATE_KEY environment variable is required")

    account = web3.eth.account.from_key(key)
    vault   = _get_vault_contract(web3, vault_address)
    cid_bytes = bytes.fromhex(cid_bytes32[2:] if cid_bytes32.startswith("0x") else cid_bytes32)

    logger.info(
        "Rebalance v2: USDC=%d EURC=%d USYC=%d bps | trigger=%d signal=%d",
        decision["usdc_bps"], decision["eurc_bps"], decision["usyc_bps"],
        trigger_type, network_signal_value,
    )

    base_tx = _build_base_tx(web3, account.address, DEFAULT_GAS_REBALANCE)
    tx = vault.functions.rebalance(
        decision["usdc_bps"],
        decision["eurc_bps"],
        decision["usyc_bps"],
        cid_bytes,
        min_usdc_out,
        trigger_type,
        network_signal_value,
    ).build_transaction(base_tx)

    tx_hash = _broadcast(web3, tx, key, dry_run)

    if not dry_run:
        _try_update_nav(web3, vault, account.address, key)

    return tx_hash


def submit_emergency_exit(
    cid_bytes32: str,
    w3: Optional[Web3] = None,
    private_key: Optional[str] = None,
    vault_address: Optional[str] = None,
    dry_run: bool = False,
) -> str:
    """
    Build, sign, and submit an emergencyExit transaction to Arc.

    Parameters
    ----------
    cid_bytes32 : str
        0x-prefixed bytes32 hex string of the IPFS reasoning CID hash.
    w3 : Web3, optional
        Web3 instance (falls back to module-level lazy-init).
    private_key : str, optional
        Override agent private key (defaults to AGENT_PRIVATE_KEY env var).
    vault_address : str, optional
        Override vault contract address (defaults to VAULT_ADDRESS env var).
    dry_run : bool
        If True, build and sign but do not broadcast. Returns signed tx hash.

    Returns
    -------
    str
        Transaction hash hex string.
    """
    web3 = _get_web3(w3)
    key  = private_key or AGENT_PRIVATE_KEY
    if not key:
        raise ValueError("AGENT_PRIVATE_KEY environment variable is required")

    account = web3.eth.account.from_key(key)
    vault   = _get_vault_contract(web3, vault_address)
    cid_bytes = bytes.fromhex(cid_bytes32[2:] if cid_bytes32.startswith("0x") else cid_bytes32)

    logger.warning("EMERGENCY EXIT initiated")

    base_tx = _build_base_tx(web3, account.address, DEFAULT_GAS_EMERGENCY)
    tx = vault.functions.emergencyExit(cid_bytes).build_transaction(base_tx)

    return _broadcast(web3, tx, key, dry_run)


# ─── Nav Update Helper ───────────────────────────────────────────────────────
def _try_update_nav(
    w3: Web3,
    vault,
    account_address: str,
    key: str,
) -> None:
    """
    Attempt to call updateNav() on the vault after a rebalance.
    Failures are logged but do not raise — NAV update is best-effort.
    """
    try:
        from skills.market_fetch.market_fetch import _fetch_usyc_nav
    except ImportError:
        try:
            from agent.skills.market_fetch.market_fetch import _fetch_usyc_nav  # type: ignore
        except ImportError:
            logger.debug("market_fetch not available — skipping updateNav")
            return

    try:
        nav, _ = _fetch_usyc_nav()
        if nav is None or nav <= 0:
            logger.debug("No valid NAV from feed — skipping updateNav")
            return

        # Convert to 18-decimal fixed point
        nav_fixed = int(nav * 1e18)

        base_tx = _build_base_tx(w3, account_address, DEFAULT_GAS_NAV)
        tx = vault.functions.updateNav(nav_fixed).build_transaction(base_tx)

        signed  = w3.eth.account.sign_transaction(tx, key)
        tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=TX_RECEIPT_TIMEOUT)

        logger.info(
            "updateNav confirmed. nav=%.6f tx=%s block=%s",
            nav, tx_hash.hex(), receipt.get("blockNumber"),
        )
    except Exception as e:
        logger.warning("updateNav failed (non-fatal): %s", e)


# ─── CLI Entry Point ────────────────────────────────────────────────────────
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    print("Arc Submit skill v2 loaded.")
    print(f"  Vault:        {VAULT_ADDRESS or '(not set)'}")
    print(f"  RPC:          {ARC_RPC or '(not set)'}")
    print(f"  Gas (rb):     {DEFAULT_GAS_REBALANCE}")
    print(f"  Gas (em):     {DEFAULT_GAS_EMERGENCY}")
    print(f"  Gas (nav):    {DEFAULT_GAS_NAV}")
    print(f"  Trigger constants: SCHEDULED={TRIGGER_SCHEDULED} CONSENSUS={TRIGGER_CONSENSUS} "
          f"STABLFX={TRIGGER_STABLFX} MACRO={TRIGGER_MACRO} MANUAL={TRIGGER_MANUAL}")
