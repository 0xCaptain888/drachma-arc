"""
Market data fetching — Circle MCP Server integration.
Replaces mock data with real on-chain + oracle data.
"""

import os, json, time
from dataclasses import dataclass, field
from typing import List, Optional
from datetime import datetime, timezone

try:
    from anthropic import Anthropic
    HAS_ANTHROPIC = True
except ImportError:
    HAS_ANTHROPIC = False

@dataclass
class MarketSnapshot:
    usdc_eurc_rate: float = 1.08
    usyc_nav_per_share: float = 1.0
    usyc_apy_30d: float = 4.0
    ecb_rate: float = 2.75
    fed_rate: float = 4.5
    eur_usd_1w_implied_vol: float = 5.2
    upcoming_macro_events: list = field(default_factory=list)
    depeg_alerts: list = field(default_factory=list)
    eurc_secondary_spread_bps: int = 20
    stablfx_spread_bps: int = 15
    data_source: str = "fallback_conservative"
    vault_usdc: float = 0
    vault_eurc: float = 0
    vault_usyc_shares: float = 0
    vault_total_aum_usdc: float = 0
    owner_profile: dict = field(default_factory=dict)
    fetched_at: str = ""


CIRCLE_MCP_URL = os.getenv("CIRCLE_MCP_URL", "https://mcp.circle.com")


def fetch_market_data_real() -> dict:
    """
    Use Claude + Circle MCP Server to fetch real market data.
    Falls back to conservative estimates if MCP unavailable.
    """
    if not HAS_ANTHROPIC or not os.getenv("ANTHROPIC_API_KEY"):
        return _fallback_market_data()

    try:
        client = Anthropic()
        response = client.beta.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=600,
            # Circle MCP Server integration for real on-chain data
            tools=[{
                "type": "mcp",
                "server_label": "circle",
                "server_url": CIRCLE_MCP_URL,
                # Available tools from Circle MCP:
                # - get_stablefx_rate: USDC/EURC spot rate
                # - get_usyc_nav: USYC current NAV per share
                # - get_usyc_apy: USYC 30-day APY
                # - get_arc_gas_price: current Arc gas price
            }],
            messages=[{
                "role": "user",
                "content": """Fetch the following real-time data from Circle's platform:
1. Current USDC/EURC exchange rate from StableFX oracle on Arc testnet
2. Current USYC NAV per share (in USDC, 6 decimals)
3. USYC 30-day annualized APY
4. Current StableFX USDC/EURC bid-ask spread in basis points

Return ONLY a JSON object with these exact keys:
{"usdc_eurc_rate": <float>, "usyc_nav_per_share": <float>, "usyc_apy_30d": <float>, "stablfx_spread_bps": <int>, "data_timestamp": "<ISO 8601>", "source": "circle_mcp"}"""
            }]
        )

        # Extract text content from response
        text = ""
        for block in response.content:
            if hasattr(block, 'text'):
                text += block.text

        raw = text.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"): raw = raw[4:]
        return json.loads(raw.strip())
    except Exception as e:
        print(f"[MCP] Circle MCP unavailable: {e}. Using fallback.")
        return _fallback_market_data()


def _fallback_market_data() -> dict:
    """Conservative fallback — clearly labeled."""
    return {
        "usdc_eurc_rate": 1.08,
        "usyc_nav_per_share": 1.00,
        "usyc_apy_30d": 4.0,
        "stablfx_spread_bps": 25,
        "data_timestamp": "FALLBACK",
        "source": "fallback_conservative"
    }


def fetch_macro_data() -> dict:
    """
    Fetch ECB/Fed rates and EUR/USD implied vol.
    Uses Claude's knowledge + publicly available data.
    In production: integrate FRED API and CBOE options data.
    """
    if not HAS_ANTHROPIC or not os.getenv("ANTHROPIC_API_KEY"):
        return _fallback_macro_data()

    try:
        client = Anthropic()
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=300,
            messages=[{
                "role": "user",
                "content": """Current macro data (use your most recent knowledge):
1. ECB deposit facility rate (%)
2. Fed funds effective rate (%)
3. EUR/USD 1-week implied volatility (approximate %)
4. Any major upcoming ECB or Fed events in next 7 days

Return ONLY valid JSON:
{"ecb_rate": <float>, "fed_rate": <float>, "eur_usd_1w_vol": <float>, "upcoming_events": [{"date": "YYYY-MM-DD", "event": "..."}]}"""
            }]
        )
        raw = response.content[0].text.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"): raw = raw[4:]
        return json.loads(raw.strip())
    except Exception as e:
        print(f"[Macro] Macro data fetch failed: {e}. Using fallback.")
        return _fallback_macro_data()


def _fallback_macro_data() -> dict:
    """Conservative fallback for macro data."""
    return {
        "ecb_rate": 2.75,
        "fed_rate": 4.5,
        "eur_usd_1w_vol": 5.2,
        "upcoming_events": []
    }


def fetch_market_data(vault_state: dict = None, owner_profile: dict = None, prev_snapshot=None) -> MarketSnapshot:
    """Main entry point. Priority: Circle MCP → fallback."""
    vault_state = vault_state or {}
    owner_profile = owner_profile or {}

    circle_data = fetch_market_data_real()
    macro_data = fetch_macro_data()

    stablfx_spread = circle_data.get("stablfx_spread_bps", 20)
    eurc_spread = stablfx_spread + 5
    depeg_alerts = []
    if eurc_spread > 50:
        depeg_alerts.append(f"EURC spread elevated: {eurc_spread}bps")

    return MarketSnapshot(
        usdc_eurc_rate=circle_data.get("usdc_eurc_rate", 1.08),
        usyc_nav_per_share=circle_data.get("usyc_nav_per_share", 1.0),
        usyc_apy_30d=circle_data.get("usyc_apy_30d", 4.0),
        ecb_rate=macro_data.get("ecb_rate", 2.75),
        fed_rate=macro_data.get("fed_rate", 4.5),
        eur_usd_1w_implied_vol=macro_data.get("eur_usd_1w_vol", 5.2),
        upcoming_macro_events=macro_data.get("upcoming_events", []),
        stablfx_spread_bps=stablfx_spread,
        eurc_secondary_spread_bps=eurc_spread,
        depeg_alerts=depeg_alerts,
        data_source=circle_data.get("source", "unknown"),
        vault_usdc=vault_state.get("usdc", 0),
        vault_eurc=vault_state.get("eurc", 0),
        vault_usyc_shares=vault_state.get("usyc_shares", 0),
        vault_total_aum_usdc=vault_state.get("total_aum", 0),
        owner_profile=owner_profile,
        fetched_at=datetime.now(timezone.utc).isoformat(),
    )
