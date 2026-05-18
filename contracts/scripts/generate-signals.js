const hre = require("hardhat");

const VAULT = "0x4D2dc79fA805448a388c60F46dAd6907d7ec91b3";
const SIGNAL_BUS = "0x65dA5f7aC697EFD8d76C8248a2bCe5b09872BE86";
const SCORE_ORACLE = "0xe5f51Ec775851Cc6a0cAD6Bcf80e899C5eC8399A";
const AGENT_KEY = "5ee8b71aaf6a0a7fa57e32b8d3084ae00f4ffeda3833f15823c763b4d8b88899";
const DEPLOYER_KEY = "0x506994495db776d17deac4d56e69502b12e66ece1112b5a1e0a67923a0b45ebf";

async function main() {
  const provider = new hre.ethers.JsonRpcProvider("https://rpc.testnet.arc.network");
  const agentWallet = new hre.ethers.Wallet(AGENT_KEY, provider);
  const deployerWallet = new hre.ethers.Wallet(DEPLOYER_KEY, provider);
  
  console.log("Agent:", agentWallet.address);
  console.log("Agent balance:", hre.ethers.formatEther(await provider.getBalance(agentWallet.address)));

  const signalBus = await hre.ethers.getContractAt("DrachmaSignalBus", SIGNAL_BUS, agentWallet);
  const scoreOracle = await hre.ethers.getContractAt("DrachmaScoreOracle", SCORE_ORACLE, deployerWallet);
  const vault = await hre.ethers.getContractAt("DrachmaVault", VAULT, agentWallet);

  // --- Submit signals ---
  console.log("\n--- Submitting signals ---");
  const signals = [
    { type: 0, value: 38 },   // EURC spread 38bps
    { type: 1, value: 1002 }, // USYC NAV movement
    { type: 5, value: 450 },  // Yield spike 4.5%
    { type: 4, value: -25 },  // Macro alert
    { type: 0, value: 35 },   // Another EURC spread
    { type: 0, value: 41 },   // EURC spread from "another vault" perspective
    { type: 2, value: 15 },   // StableFX thin liquidity
    { type: 3, value: 100 },  // Depeg warning
  ];
  
  for (const sig of signals) {
    try {
      const tx = await signalBus.submitSignal(sig.type, sig.value, { gasLimit: 500000 });
      await tx.wait();
      console.log(`Signal: type=${sig.type}, value=${sig.value} | tx: ${tx.hash}`);
    } catch(e) {
      console.log(`Signal type=${sig.type} failed: ${e.message.slice(0, 80)}`);
    }
  }

  // Check total signals
  const totalSigs = await signalBus.totalSignals();
  console.log("Total signals now:", totalSigs.toString());

  // --- Update DrachmaScore ---
  console.log("\n--- Updating DrachmaScore ---");
  try {
    const components = {
      yieldPerformance: 220,
      bandDiscipline: 200,
      riskResponse: 180,
      consistency: 150
    };
    const evidenceCID = hre.ethers.encodeBytes32String("QmScore1stWeek");
    const now = Math.floor(Date.now() / 1000);
    const scoreTx = await scoreOracle.updateScore(
      VAULT, components, evidenceCID,
      now - 604800, now,
      { gasLimit: 300000 }
    );
    await scoreTx.wait();
    console.log("Score updated! tx:", scoreTx.hash);
    const score = await scoreOracle.getScore(VAULT);
    console.log("Score: " + score.toString() + "/1000");
  } catch(e) {
    console.log("Score failed:", e.message.slice(0, 120));
  }

  // --- Update vault reserve score ---
  console.log("\n--- Syncing vault score ---");
  try {
    const cid = hre.ethers.encodeBytes32String("QmVaultScoreW1");
    const tx = await vault.updateReserveScore(750, cid, { gasLimit: 200000 });
    await tx.wait();
    console.log("Vault score: 750 | tx:", tx.hash);
  } catch(e) {
    console.log("Vault score failed:", e.message.slice(0, 100));
  }

  // --- NAV Update ---
  console.log("\n--- Updating NAV ---");
  try {
    const tx = await vault.updateNav({ gasLimit: 200000 });
    await tx.wait();
    console.log("NAV updated! tx:", tx.hash);
    const nav = await vault.navPerShare();
    console.log("NAV per share:", nav.toString());
  } catch(e) {
    console.log("NAV failed:", e.message.slice(0, 100));
  }

  console.log("\n=== COMPLETE ===");
  console.log("Explorer: https://testnet.arcscan.app/address/" + VAULT);
  console.log("SignalBus: https://testnet.arcscan.app/address/" + SIGNAL_BUS);
  console.log("ScoreOracle: https://testnet.arcscan.app/address/" + SCORE_ORACLE);
}

main().catch(e => { console.error(e); process.exitCode = 1; });
