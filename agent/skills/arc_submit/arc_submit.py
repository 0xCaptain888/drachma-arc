"""
Arc Submit Skill
================
Builds, signs, and submits rebalance() or emergencyExit() transactions
to the Drachma vault on Arc (Circle's L1) via Web3.

Standalone module — can be invoked directly or via MuleRun skill trigger:
    "submit rebalance tx for {decision}"
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
DEFAULT_GAS_REBALANCE   = int(os.getenv("GAS_REBALANCE", 700_000))
DEFAULT_GAS_EMERGENCY   = int(os.getenv("GAS_EMERGENCY", 500_000))
MAX_FEE_PER_GAS_GWEI    = os.getenv("MAX_FEE_PER_GAS_GWEI", "1")
MAX_PRIORITY_FEE_GWEI   = os.getenv("MAX_PRIORITY_FEE_GWEI", "0.1")
TX_RECEIPT_TIMEOUT       = int(os.getenv("TX_RECEIPT_TIMEOUT", 30))

# Vault ABI — rebalance, emergencyExit, and totalAum functions
VAULT_ABI = json.loads(
    '['
    '{"name":"rebalance","type":"function","inputs":['
    '{"name":"targetUsdcBps","type":"uint16"},'
    '{"name":"targetEurcBps","type":"uint16"},'
    '{"name":"targetUsycBps","type":"uint16"},'
    '{"name":"reasoningCID","type":"bytes32"},'
    '{"name":"minUsdcOut","type":"uint256"}'
    '],"outputs":[]},'
    '{"name":"emergencyExit","type":"function","inputs":['
    '{"name":"reasoningCID","type":"bytes32"}'
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

_w3 = None


def _get_web3() -> Web3:
    """Lazy-init Web3 provider."""
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
        "from": account_address,
        "nonce": w3.eth.get_transaction_count(account_address),
        "gas": gas,
        "maxFeePerGas": w3.to_wei(MAX_FEE_PER_GAS_GWEI, "gwei"),
        "maxPriorityFeePerGas": w3.to_wei(MAX_PRIORITY_FEE_GWEI, "gwei"),
    }


# ─── Public Entry Point ─────────────────────────────────────────────────────
def submit_rebalance(
    decision: dict,
    cid_bytes32: str,
    vault_address: Optional[str] = None,
    private_key: Optional[str] = None,
    min_usdc_out: int = 0,
    dry_run: bool = False,
) -> str:
    """
    Build, sign, and submit a rebalance or emergencyExit transaction to Arc.

    Parameters
    ----------
    decision : dict
        Validated LLM decision with keys: action, usdc_bps, eurc_bps, usyc_bps.
    cid_bytes32 : str
        0x-prefixed bytes32 hex string of the IPFS reasoning CID hash.
    vault_address : str, optional
        Override vault contract address (defaults to VAULT_ADDRESS env var).
    private_key : str, optional
        Override agent private key (defaults to AGENT_PRIVATE_KEY env var).
    min_usdc_out : int
        Minimum USDC output for slippage protection (default 0).
    dry_run : bool
        If True, build and sign the transaction but do not broadcast.
        Returns the signed tx hash without submitting.

    Returns
    -------
    str
        Transaction hash hex string, or "hold — no tx submitted" for hold actions.

    Raises
    ------
    ValueError
        If required config is missing.
    web3.exceptions.TransactionNotFound
        If the transaction receipt times out.
    """
    action = decision.get("action", "hold")

    if action == "hold":
        logger.info("Action is 'hold' — no transaction submitted")
        return "hold — no tx submitted"

    w3 = _get_web3()
    key = private_key or AGENT_PRIVATE_KEY
    if not key:
        raise ValueError("AGENT_PRIVATE_KEY environment variable is required")

    account = w3.eth.account.from_key(key)
    vault = _get_vault_contract(w3, vault_address)
    cid_bytes = bytes.fromhex(cid_bytes32[2:])

    if action == "emergency_exit":
        logger.warning("EMERGENCY EXIT initiated")
        base_tx = _build_base_tx(w3, account.address, DEFAULT_GAS_EMERGENCY)
        tx = vault.functions.emergencyExit(cid_bytes).build_transaction(base_tx)

    elif action == "rebalance":
        logger.info(
            "Rebalance: USDC=%d EURC=%d USYC=%d bps",
            decision["usdc_bps"], decision["eurc_bps"], decision["usyc_bps"],
        )
        base_tx = _build_base_tx(w3, account.address, DEFAULT_GAS_REBALANCE)
        tx = vault.functions.rebalance(
            decision["usdc_bps"],
            decision["eurc_bps"],
            decision["usyc_bps"],
            cid_bytes,
            min_usdc_out,
        ).build_transaction(base_tx)

    else:
        raise ValueError(f"Unknown action: '{action}'")

    # Sign the transaction
    signed = w3.eth.account.sign_transaction(tx, key)
    tx_hash_hex = signed.hash.hex()

    if dry_run:
        logger.info("DRY RUN — signed tx hash: %s (not broadcast)", tx_hash_hex)
        return tx_hash_hex

    # Broadcast and wait for confirmation
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


# ─── CLI Entry Point ────────────────────────────────────────────────────────
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    print("Arc Submit skill loaded. Use submit_rebalance() to submit transactions.")
    print(f"  Vault:    {VAULT_ADDRESS or '(not set)'}")
    print(f"  RPC:      {ARC_RPC or '(not set)'}")
    print(f"  Gas (rb): {DEFAULT_GAS_REBALANCE}")
    print(f"  Gas (em): {DEFAULT_GAS_EMERGENCY}")
