"""Market Fetch skill — re-exports for package imports."""
from .market_fetch import fetch_market_data, fetch_macro_data, MarketSnapshot

__all__ = ["fetch_market_data", "fetch_macro_data", "MarketSnapshot"]
