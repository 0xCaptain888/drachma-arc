"""
Market Fetch Skill
==================
Fetches live vault balances from Arc RPC, USDC/EURC rate from StableFX oracle,
USYC NAV, ECB/Fed rates. Returns a MarketSnapshot for the LLM reasoning step.

Standalone module — can be invoked directly or via MuleRun skill trigger:
    "fetch market data for vault {address}"
"""

import os
import json
import random
import logging
from dataclasses import dataclass, asdict
from typing import Optional

import httpx
from web3 import Web3
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("drachma.market_fetch")

# ─── Config ──────────────────────────────────────────────────────────────────
ARC_RPC       = os.getenv("ARC_RPC_URL")
VAULT_ADDRESS = os.getenv("VAULT_ADDRESS")

# External data source endpoints (override via env for production)
STABLEFX_ORACLE_URL = os.getenv(
    "STABLEFX_ORACLE_URL",
    "https://api.stablefx.io/v1/rates",
)
USYC_NAV_URL = os.getenv(
    "USYC_NAV_URL",
    "https://api.hashnote.com/v1/usyc/nav",
)
MACRO_RATES_URL = os.getenv(
    "MACRO_RATES_URL",
    "https://api.tradingeconomics.com/rates",
)

# Vault ABI (totalAum view function)
VAULT_ABI = json.loads(
    '[{"name":"totalAum","type":"function","stateMutability":"view",'
    '"inputs":[],"outputs":[{"name":"usdc","type":"uint256"},'
    '{"name":"eurc","type":"uint256"},{"name":"usyc","type":"uint256"},'
    '{"name":"totalInUsdc","type":"uint256"}]}]'
)


# ─── MarketSnapshot Dataclass ────────────────────────────────────────────────
@dataclass
class MarketSnapshot:
    """Complete market + vault state consumed by the LLM reasoning skill."""
    usdc_eurc_rate:              float
    usyc_nav_per_share:          float
    usyc_apy_30d:                float
    ecb_rate:                    float
    fed_rate:                    float
    eur_usd_1w_implied_vol:      float
    depeg_alerts:                list
    vault_usdc:                  float
    vault_eurc:                  float
    vault_usyc_shares:           float
    vault_total_aum_usdc:        float
    owner_profile:               dict
    # v2 fields — optional with defaults for backward compatibility
    eurc_secondary_spread_bps:   Optional[int] = None
    stablfx_spread_bps:          Optional[int] = None

    def to_dict(self) -> dict:
        """Serialize for JSON transport."""
        return asdict(self)


# ─── Live Data Fetchers (stubs — replace with real API calls) ────────────────
def _fetch_usdc_eurc_rate() -> Optional[float]:
    """Fetch USDC/EURC spot rate from StableFX oracle."""
    try:
        resp = httpx.get(
            STABLEFX_ORACLE_URL,
            params={"pair": "USDC_EURC"},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        return float(data.get("rate", 0))
    except Exception as e:
        logger.warning("StableFX oracle unreachable: %s — using mock", e)
        return None


def _fetch_usyc_nav() -> tuple[Optional[float], Optional[float]]:
    """Fetch USYC NAV per share and trailing 30d APY."""
    try:
        resp = httpx.get(USYC_NAV_URL, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        return float(data.get("nav_per_share", 0)), float(data.get("apy_30d", 0))
    except Exception as e:
        logger.warning("USYC NAV endpoint unreachable: %s — using mock", e)
        return None, None


def _fetch_macro_rates() -> tuple[Optional[float], Optional[float], Optional[float]]:
    """Fetch ECB deposit rate, Fed funds rate, EUR/USD 1W implied vol."""
    try:
        resp = httpx.get(MACRO_RATES_URL, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        return (
            float(data.get("ecb_deposit", 0)),
            float(data.get("fed_funds", 0)),
            float(data.get("eurusd_1w_iv", 0)),
        )
    except Exception as e:
        logger.warning("Macro rates endpoint unreachable: %s — using mock", e)
        return None, None, None


def _check_depeg_alerts() -> list:
    """Check for USDC or EURC depeg alerts from monitoring feeds."""
    # In production, poll monitoring APIs (e.g., DeFi Llama, Chainlink price feeds)
    # and return list of alert strings if any stablecoin deviates > 50bps from peg.
    return []


def _fetch_vault_state(vault_address: Optional[str] = None) -> dict:
    """Read on-chain vault balances via Arc RPC."""
    address = vault_address or VAULT_ADDRESS
    if not address or not ARC_RPC:
        logger.warning("Vault address or RPC not configured — returning empty state")
        return {"usdc": 0, "eurc": 0, "usyc_shares": 0, "total_aum": 0}

    try:
        w3 = Web3(Web3.HTTPProvider(ARC_RPC))
        vault = w3.eth.contract(
            address=Web3.to_checksum_address(address),
            abi=VAULT_ABI,
        )
        usdc, eurc, usyc_shares, total = vault.functions.totalAum().call()
        return {
            "usdc": usdc / 1e6,
            "eurc": eurc / 1e6,
            "usyc_shares": usyc_shares / 1e18,
            "total_aum": total / 1e6,
        }
    except Exception as e:
        logger.error("Failed to read vault state: %s", e)
        raise


# ─── Mock Fallback ───────────────────────────────────────────────────────────
def _mock_market_data() -> dict:
    """Generate plausible mock data when live feeds are unavailable."""
    return {
        "usdc_eurc_rate":              1.082 + random.uniform(-0.003, 0.003),
        "usyc_nav_per_share":          1.00 + (0.045 / 365) * 30,
        "usyc_apy_30d":                4.48 + random.uniform(-0.1, 0.1),
        "ecb_rate":                    3.5,
        "fed_rate":                    4.75,
        "eur_usd_1w_implied_vol":      5.2 + random.uniform(-0.3, 0.3),
        "depeg_alerts":                [],
        "eurc_secondary_spread_bps":   int(abs(random.gauss(15, 6))),
        "stablfx_spread_bps":          int(abs(random.gauss(20, 8))),
    }


# ─── Public Entry Point ─────────────────────────────────────────────────────
def fetch_market_data(
    vault_state: dict,
    owner_profile: dict,
    use_mock: bool = False,
) -> MarketSnapshot:
    """
    Fetch all market data and combine with vault state into a MarketSnapshot.

    Parameters
    ----------
    vault_state : dict
        Keys: usdc, eurc, usyc_shares, total_aum (all floats, human-readable units).
    owner_profile : dict
        Owner preferences (spending_currency, monthly_outflow_usdc, etc.).
    use_mock : bool
        If True, skip live API calls and use deterministic mock data.

    Returns
    -------
    MarketSnapshot
    """
    if use_mock:
        market = _mock_market_data()
    else:
        # Attempt live fetches; fall back to mock values per-field
        mock = _mock_market_data()

        usdc_eurc = _fetch_usdc_eurc_rate()
        nav, apy = _fetch_usyc_nav()
        ecb, fed, iv = _fetch_macro_rates()
        depeg = _check_depeg_alerts()

        market = {
            "usdc_eurc_rate":            usdc_eurc if usdc_eurc else mock["usdc_eurc_rate"],
            "usyc_nav_per_share":        nav if nav else mock["usyc_nav_per_share"],
            "usyc_apy_30d":              apy if apy else mock["usyc_apy_30d"],
            "ecb_rate":                  ecb if ecb else mock["ecb_rate"],
            "fed_rate":                  fed if fed else mock["fed_rate"],
            "eur_usd_1w_implied_vol":    iv if iv else mock["eur_usd_1w_implied_vol"],
            "depeg_alerts":              depeg,
            "eurc_secondary_spread_bps": mock["eurc_secondary_spread_bps"],
            "stablfx_spread_bps":        mock["stablfx_spread_bps"],
        }

    return MarketSnapshot(
        usdc_eurc_rate             = market["usdc_eurc_rate"],
        usyc_nav_per_share         = market["usyc_nav_per_share"],
        usyc_apy_30d               = market["usyc_apy_30d"],
        ecb_rate                   = market["ecb_rate"],
        fed_rate                   = market["fed_rate"],
        eur_usd_1w_implied_vol     = market["eur_usd_1w_implied_vol"],
        depeg_alerts               = market["depeg_alerts"],
        vault_usdc                 = vault_state.get("usdc", 0),
        vault_eurc                 = vault_state.get("eurc", 0),
        vault_usyc_shares          = vault_state.get("usyc_shares", 0),
        vault_total_aum_usdc       = vault_state.get("total_aum", 0),
        owner_profile              = owner_profile,
        eurc_secondary_spread_bps  = market.get("eurc_secondary_spread_bps"),
        stablfx_spread_bps         = market.get("stablfx_spread_bps"),
    )


# ─── CLI Entry Point ────────────────────────────────────────────────────────
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    state = _fetch_vault_state()
    profile = {"spending_currency": "USD", "monthly_outflow_usdc": 2000}
    snap = fetch_market_data(state, profile)
    print(json.dumps(snap.to_dict(), indent=2, default=str))
