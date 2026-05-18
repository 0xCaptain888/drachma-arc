---
name: drachma-conversation
description: >
  Natural language treasury management for Drachma vault owners.
  Trigger when user wants to change their stablecoin allocation strategy,
  update spending profile, adjust risk tolerance, or discuss their vault.
  Examples: "I need more liquidity", "maximize my yield", "I'm moving to Europe",
  "my client might not pay", "be more conservative", "update my EUR exposure".
trigger_phrases:
  - "allocation"
  - "EURC"
  - "USDC"
  - "USYC"
  - "treasury"
  - "liquidity"
  - "yield"
  - "risk"
  - "conservative"
  - "aggressive"
  - "moving to"
  - "spending"
  - "payment"
requires_context:
  - vault_address
  - owner_key (encrypted)
  - current_vault_state
  - current_profile
  - current_bands
outputs:
  - conversational_response
  - optional: on-chain tx hash
  - optional: IPFS conversation record CID
---
