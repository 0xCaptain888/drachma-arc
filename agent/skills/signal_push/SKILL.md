---
name: signal-push
description: >
  Market anomaly detection and DrachmaSignalBus signal submission.
  Scans market snapshots for EURC spread, USYC NAV, StableFX liquidity,
  depeg, and yield anomalies. Submits medium+ severity signals to Arc.
trigger_phrases:
  - "check for market anomalies"
  - "submit signal to bus"
  - "detect anomalies"
---
