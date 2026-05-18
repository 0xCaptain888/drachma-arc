"""
Consensus Listener Skill
========================
Asynchronous WebSocket listener for DrachmaSignalBus.ConsensusReached events.

Connects to the Arc RPC WebSocket endpoint and subscribes to logs emitted
by the DrachmaSignalBus contract. When a ConsensusReached event is decoded,
the provided callback coroutine is invoked with the signal parameters so the
main agent loop can trigger an emergency assessment.

Event signature:
    ConsensusReached(uint8 signalType, int32 avgValue, uint32 vaultCount)

Standalone module — trigger phrase: "listen for consensus"
"""

import asyncio
import json
import logging
from typing import Callable, Awaitable, Optional

import websockets
from eth_abi import decode as abi_decode
from web3 import Web3

logger = logging.getLogger("drachma.consensus_listener")

# ─── ABI / Event Constants ───────────────────────────────────────────────────
# keccak256("ConsensusReached(uint8,int32,uint32)")
CONSENSUS_TOPIC = "0x" + Web3.keccak(
    text="ConsensusReached(uint8,int32,uint32)"
).hex()

# Reconnect settings
RECONNECT_DELAY_SECS  = int(5)
MAX_RECONNECT_DELAY   = int(60)


# ─── Log Decoder ────────────────────────────────────────────────────────────
def _decode_consensus_log(log: dict) -> Optional[tuple[int, int, int]]:
    """
    Decode a raw eth_subscribe log entry for ConsensusReached.

    Returns
    -------
    tuple (signal_type, avg_value, vault_count) or None if not a match.
    """
    topics = log.get("topics", [])
    if not topics or topics[0].lower() != CONSENSUS_TOPIC.lower():
        return None

    data_hex = log.get("data", "0x")
    if data_hex.startswith("0x"):
        data_hex = data_hex[2:]

    if not data_hex:
        return None

    try:
        raw = bytes.fromhex(data_hex)
        # ConsensusReached(uint8 signalType, int32 avgValue, uint32 vaultCount)
        # All packed as 256-bit words in ABI encoding
        signal_type, avg_value, vault_count = abi_decode(
            ["uint8", "int32", "uint32"], raw
        )
        return int(signal_type), int(avg_value), int(vault_count)
    except Exception as e:
        logger.warning("Failed to decode ConsensusReached log: %s", e)
        return None


# ─── WebSocket Listener ──────────────────────────────────────────────────────
async def listen_for_consensus(
    ws_url: str,
    bus_address: str,
    callback: Callable[[int, int, int], Awaitable[None]],
) -> None:
    """
    Connect to the Arc RPC WebSocket and listen for ConsensusReached events
    from the DrachmaSignalBus contract. Reconnects automatically on disconnect.

    Parameters
    ----------
    ws_url : str
        WebSocket RPC endpoint (e.g. "wss://rpc-testnet.arcprotocol.xyz/ws").
    bus_address : str
        DrachmaSignalBus contract address (checksummed or lowercase).
    callback : async callable
        Coroutine called with (signal_type: int, avg_value: int, vault_count: int)
        whenever a ConsensusReached event is received.
    """
    checksum_addr = Web3.to_checksum_address(bus_address)
    delay = RECONNECT_DELAY_SECS

    logger.info(
        "[ConsensusListener] Subscribing to %s for bus=%s",
        ws_url, checksum_addr,
    )

    while True:
        try:
            async with websockets.connect(ws_url, ping_interval=20, ping_timeout=30) as ws:
                delay = RECONNECT_DELAY_SECS  # reset backoff on successful connect

                # Subscribe to logs for the signal bus contract
                subscribe_msg = json.dumps({
                    "jsonrpc": "2.0",
                    "id":      1,
                    "method":  "eth_subscribe",
                    "params":  [
                        "logs",
                        {
                            "address": checksum_addr,
                            "topics":  [CONSENSUS_TOPIC],
                        },
                    ],
                })
                await ws.send(subscribe_msg)

                # Read the subscription confirmation
                raw = await ws.recv()
                resp = json.loads(raw)
                if "error" in resp:
                    raise RuntimeError(f"Subscribe error: {resp['error']}")

                sub_id = resp.get("result")
                logger.info("[ConsensusListener] Subscription ID: %s", sub_id)

                # Event loop
                async for message in ws:
                    try:
                        msg = json.loads(message)
                        params = msg.get("params", {})
                        result = params.get("result", {})

                        decoded = _decode_consensus_log(result)
                        if decoded is None:
                            continue

                        signal_type, avg_value, vault_count = decoded
                        logger.warning(
                            "[ConsensusListener] ConsensusReached: type=%d avg=%dbps vaults=%d",
                            signal_type, avg_value, vault_count,
                        )
                        await callback(signal_type, avg_value, vault_count)

                    except json.JSONDecodeError:
                        logger.warning("[ConsensusListener] Non-JSON message received")
                    except Exception as e:
                        logger.error("[ConsensusListener] Error processing message: %s", e)

        except (websockets.exceptions.ConnectionClosed,
                websockets.exceptions.WebSocketException,
                OSError) as e:
            logger.warning(
                "[ConsensusListener] Connection lost (%s). Reconnecting in %ds...",
                e, delay,
            )
            await asyncio.sleep(delay)
            delay = min(delay * 2, MAX_RECONNECT_DELAY)

        except asyncio.CancelledError:
            logger.info("[ConsensusListener] Listener cancelled — shutting down")
            return

        except Exception as e:
            logger.error(
                "[ConsensusListener] Unexpected error: %s. Reconnecting in %ds...",
                e, delay,
            )
            await asyncio.sleep(delay)
            delay = min(delay * 2, MAX_RECONNECT_DELAY)


# ─── CLI Entry Point ────────────────────────────────────────────────────────
if __name__ == "__main__":
    import os
    import logging as _logging
    from dotenv import load_dotenv
    load_dotenv()
    _logging.basicConfig(level=_logging.INFO)

    WS_URL  = os.getenv("ARC_RPC_WS", "wss://rpc-testnet.arcprotocol.xyz/ws")
    BUS_ADR = os.getenv("SIGNAL_BUS_ADDRESS", "0x0000000000000000000000000000000000000000")

    async def _demo_callback(signal_type: int, avg_value: int, vault_count: int):
        print(f"CALLBACK: type={signal_type} avg={avg_value}bps vaults={vault_count}")

    asyncio.run(listen_for_consensus(WS_URL, BUS_ADR, _demo_callback))
