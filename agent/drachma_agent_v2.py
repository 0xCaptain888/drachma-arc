"""
Drachma Agent v2 — Event-Driven Autonomous Stablecoin Reserve Manager
Runs on MuleRun VM (persistent, 24/7).
"""

import os, json, time, asyncio, hashlib, logging
from datetime import datetime, timezone, timedelta
from dataclasses import dataclass, field
from typing import Optional
from enum import Enum

import anthropic
import httpx
from web3 import Web3
from dotenv import load_dotenv

from skills.market_fetch import fetch_market_data, MarketSnapshot
from skills.llm_reason import call_llm, call_llm_urgent
from skills.signal_push import detect_anomalies, push_signals
from skills.ipfs_pin import pin_reasoning
from skills.arc_submit import submit_rebalance, submit_emergency_exit
from skills.score_calc import calculate_and_update_score
from skills.consensus_listener import listen_for_consensus

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("drachma")

ARC_RPC_WS         = os.getenv("ARC_RPC_WS",  "wss://rpc-testnet.arcprotocol.xyz/ws")
ARC_RPC_HTTP       = os.getenv("ARC_RPC_URL",  "https://rpc-testnet.arcprotocol.xyz")
VAULT_ADDRESS      = os.getenv("VAULT_ADDRESS")
SIGNAL_BUS_ADDRESS = os.getenv("SIGNAL_BUS_ADDRESS")
AGENT_PRIVATE_KEY  = os.getenv("AGENT_PRIVATE_KEY")
ANTHROPIC_API_KEY  = os.getenv("ANTHROPIC_API_KEY")
IPFS_JWT           = os.getenv("IPFS_JWT")
REGULAR_INTERVAL   = int(os.getenv("REBALANCE_INTERVAL", 14400))
SCORE_INTERVAL     = int(os.getenv("SCORE_INTERVAL", 604800))

w3     = Web3(Web3.HTTPProvider(ARC_RPC_HTTP))
client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

class Priority(Enum):
    CRITICAL  = 0
    HIGH      = 1
    MEDIUM    = 2
    SCHEDULED = 3
    LOW       = 4

@dataclass(order=True)
class AgentEvent:
    priority:    int
    event_type:  str = field(compare=False)
    payload:     dict = field(compare=False, default_factory=dict)
    created_at:  float = field(compare=False, default_factory=time.time)

event_queue: asyncio.PriorityQueue = None
prev_snapshot: Optional[MarketSnapshot] = None
owner_profile: dict = {}


async def fetch_vault_state() -> dict:
    VAULT_ABI = json.loads('[{"name":"totalAum","type":"function","stateMutability":"view","inputs":[],"outputs":[{"name":"usdc","type":"uint256"},{"name":"eurc","type":"uint256"},{"name":"usyc","type":"uint256"},{"name":"totalInUsdc","type":"uint256"}]}]')
    vault = w3.eth.contract(address=Web3.to_checksum_address(VAULT_ADDRESS), abi=VAULT_ABI)
    usdc, eurc, usyc, total = vault.functions.totalAum().call()
    total_f = total / 1e6
    return {
        "usdc": usdc / 1e6,
        "eurc": eurc / 1e6,
        "usyc_shares": usyc / 1e18,
        "total_aum": total_f,
        "usdc_pct": (usdc / 1e6 / total_f * 100) if total_f > 0 else 0,
        "eurc_pct": (eurc / 1e6 / total_f * 100) if total_f > 0 else 0,
        "usyc_pct": (usyc / 1e18 / total_f * 100) if total_f > 0 else 0,
    }


async def run_decision_cycle(is_urgent: bool = False, consensus_context: Optional[dict] = None):
    global prev_snapshot
    try:
        vault_state = await fetch_vault_state()
        snap = fetch_market_data(vault_state, owner_profile)

        if prev_snapshot:
            anomalies = detect_anomalies(snap.__dict__, prev_snapshot.__dict__)
            if anomalies:
                push_signals(anomalies, w3, AGENT_PRIVATE_KEY, SIGNAL_BUS_ADDRESS)

        if is_urgent and consensus_context:
            log.warning(f"[URGENT] Consensus signal: {consensus_context}")
            decision = call_llm_urgent(snap, consensus_context)
        else:
            decision = call_llm(snap)

        log.info(f"Decision: {decision['action']} | USDC={decision['usdc_bps']/100:.1f}% EURC={decision['eurc_bps']/100:.1f}% USYC={decision['usyc_bps']/100:.1f}% | conf={decision['confidence']:.2f}")

        if decision["confidence"] < 0.6 and not is_urgent:
            log.info("Confidence < 0.6, holding. Will retry in 30 minutes.")
            await asyncio.sleep(1800)
            return

        cid = pin_reasoning(decision, snap)

        if decision["action"] == "emergency_exit":
            tx_hash = submit_emergency_exit(cid, w3, AGENT_PRIVATE_KEY, VAULT_ADDRESS)
            log.warning(f"[EMERGENCY EXIT] TX: {tx_hash}")
        elif decision["action"] == "rebalance":
            tx_hash = submit_rebalance(decision, cid, w3, AGENT_PRIVATE_KEY, VAULT_ADDRESS)
            log.info(f"Rebalance TX: {tx_hash}")

        prev_snapshot = snap
    except Exception as e:
        log.error(f"Decision cycle error: {e}", exc_info=True)


async def on_consensus_reached(signal_type: int, avg_value: int, vault_count: int):
    log.warning(f"[ConsensusAlert] type={signal_type} avg={avg_value}bps from {vault_count} vaults")

    if signal_type == 3 and avg_value > 50:
        log.critical("[DEPEG] Critical threshold — executing emergency exit NOW")
        cid = "0x" + "0" * 64
        tx_hash = submit_emergency_exit(cid, w3, AGENT_PRIVATE_KEY, VAULT_ADDRESS)
        log.critical(f"[DEPEG] Emergency exit TX: {tx_hash}")
        return

    priority = Priority.HIGH if avg_value > 30 else Priority.MEDIUM
    await event_queue.put(AgentEvent(
        priority=priority.value,
        event_type="consensus",
        payload={"signal_type": signal_type, "avg_value": avg_value, "vault_count": vault_count}
    ))


async def macro_calendar_watcher():
    MACRO_EVENTS = [
        (datetime(2026, 5, 22, 12, 45, tzinfo=timezone.utc), "ECB Meeting Minutes", 4),
        (datetime(2026, 5, 28, 18, 0, tzinfo=timezone.utc), "Fed FOMC Statement", 4),
    ]
    while True:
        now = datetime.now(timezone.utc)
        for event_dt, desc, sig_type in MACRO_EVENTS:
            delta = (event_dt - now).total_seconds()
            if 0 < delta <= 900:
                log.info(f"[MacroCal] Pre-positioning for: {desc} in {delta:.0f}s")
                await event_queue.put(AgentEvent(
                    priority=Priority.MEDIUM.value,
                    event_type="macro_preposition",
                    payload={"description": desc, "delta_secs": delta}
                ))
        await asyncio.sleep(60)


async def stablfx_spread_watcher():
    while True:
        try:
            import random
            spread_bps = int(abs(random.gauss(20, 8)))
            if spread_bps > 50:
                log.warning(f"[StableFX] Spread spike: {spread_bps}bps")
                await event_queue.put(AgentEvent(
                    priority=Priority.HIGH.value,
                    event_type="stablfx_spread",
                    payload={"spread_bps": spread_bps}
                ))
        except Exception as e:
            log.error(f"StableFX watcher error: {e}")
        await asyncio.sleep(60)


async def scheduled_cycle_ticker():
    while True:
        await asyncio.sleep(REGULAR_INTERVAL)
        log.info("[Scheduler] Enqueuing regular decision cycle")
        await event_queue.put(AgentEvent(priority=Priority.SCHEDULED.value, event_type="scheduled"))


async def weekly_score_updater():
    while True:
        await asyncio.sleep(SCORE_INTERVAL)
        log.info("[Score] Calculating weekly DrachmaScore...")
        try:
            await calculate_and_update_score(
                vault_address=VAULT_ADDRESS,
                agent_key=AGENT_PRIVATE_KEY,
                score_oracle_addr=os.getenv("SCORE_ORACLE_ADDRESS"),
                w3=w3,
                ipfs_jwt=IPFS_JWT,
            )
        except Exception as e:
            log.error(f"Score update error: {e}")


async def event_processor():
    log.info("[Agent] Event processor started")
    while True:
        event = await event_queue.get()
        log.info(f"[Queue] Processing event: {event.event_type} (priority={event.priority})")

        if event.event_type == "consensus":
            await run_decision_cycle(is_urgent=True, consensus_context=event.payload)
        elif event.event_type == "stablfx_spread":
            await run_decision_cycle(is_urgent=True, consensus_context={"signal_type": 2, **event.payload})
        elif event.event_type == "macro_preposition":
            await run_decision_cycle(is_urgent=False, consensus_context={"macro": event.payload})
        elif event.event_type == "scheduled":
            await run_decision_cycle(is_urgent=False)

        event_queue.task_done()


async def main(profile: dict):
    global event_queue, owner_profile
    event_queue = asyncio.PriorityQueue()
    owner_profile = profile

    log.info(f"[Drachma v2] Starting. Vault: {VAULT_ADDRESS}")
    log.info(f"[Drachma v2] Signal Bus: {SIGNAL_BUS_ADDRESS}")

    await run_decision_cycle()

    await asyncio.gather(
        event_processor(),
        listen_for_consensus(ARC_RPC_WS, SIGNAL_BUS_ADDRESS, on_consensus_reached),
        scheduled_cycle_ticker(),
        macro_calendar_watcher(),
        stablfx_spread_watcher(),
        weekly_score_updater(),
    )


if __name__ == "__main__":
    profile = {
        "spending_currency": "USD",
        "secondary_currency": "EUR",
        "eur_spending_pct": 35,
        "monthly_outflow_usdc": 3000,
        "risk_tolerance": "moderate",
        "upcoming_payments": "none",
    }
    asyncio.run(main(profile))
