# Market Fetch Skill
**Trigger:** "fetch market data for vault {address}"
Fetches live vault balances from Arc RPC, USDC/EURC rate from StableFX oracle, USYC NAV, ECB/Fed rates.
Returns a MarketSnapshot object for the LLM reasoning step.
