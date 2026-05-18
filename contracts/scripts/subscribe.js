const hre = require("hardhat");

async function main() {
  const SIGNAL_BUS = "0x469ad59A4dcdFe4393d732dfE2f318bA2442ee12";
  const VAULT = "0xabDd1dB9293234FCa684FA90C7e0b047427cC7fc";
  const AGENT_KEY = process.env.AGENT_PRIVATE_KEY;

  if (!AGENT_KEY) throw new Error("Set AGENT_PRIVATE_KEY in .env");

  const agentWallet = new hre.ethers.Wallet(AGENT_KEY, hre.ethers.provider);
  console.log("Agent wallet:", agentWallet.address);

  const signalBus = await hre.ethers.getContractAt("DrachmaSignalBus", SIGNAL_BUS, agentWallet);

  const tx = await signalBus.subscribe(VAULT);
  await tx.wait();
  console.log("Vault subscribed to SignalBus. TX:", tx.hash);

  // Verify
  const isSub = await signalBus.isSubscriber(VAULT);
  console.log("isSubscriber:", isSub);
}

main().catch(e => { console.error(e); process.exit(1); });
