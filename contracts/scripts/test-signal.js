const hre = require("hardhat");

async function main() {
  const SIGNAL_BUS = "0x469ad59A4dcdFe4393d732dfE2f318bA2442ee12";
  const VAULT = "0xabDd1dB9293234FCa684FA90C7e0b047427cC7fc";
  const AGENT_KEY = process.env.AGENT_PRIVATE_KEY;

  const agentWallet = new hre.ethers.Wallet(AGENT_KEY, hre.ethers.provider);
  const signalBus = await hre.ethers.getContractAt("DrachmaSignalBus", SIGNAL_BUS, agentWallet);

  // Submit a test signal: EURC_SPREAD (type 0), value 25 (basis points)
  console.log("Submitting test signal (EURC_SPREAD, value=25)...");
  const tx = await signalBus.submitSignal(0, 25);
  const receipt = await tx.wait();
  console.log("Signal submitted. TX:", tx.hash);
  console.log("Gas used:", receipt.gasUsed.toString());

  // Check total signals
  const total = await signalBus.totalSignals();
  console.log("Total signals on-chain:", total.toString());

  // Read vault state
  const vault = await hre.ethers.getContractAt("DrachmaVault", VAULT, agentWallet);
  const score = await vault.reserveScore();
  const nav = await vault.navPerShare();
  const owner = await vault.owner();
  const agent = await vault.agent();
  console.log("\n--- Vault State ---");
  console.log("Owner:", owner);
  console.log("Agent:", agent);
  console.log("Reserve Score:", score.toString());
  console.log("NAV per Share:", nav.toString(), "(1.000000 = 1000000)");
  console.log("Decimals:", (await vault.decimals()).toString());
}

main().catch(e => { console.error(e); process.exit(1); });
