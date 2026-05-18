const hre = require("hardhat");

const FACTORY = "0x00aa544Cd58Cb785D7B70EB1805cFF2900008133";
const SIGNAL_BUS = "0xE66b90e5be9Fd497e2b0c57FF4a9F8A3b32f3Ff6";
const ORIGINAL_VAULT = "0xD3D5b81b28b51aDdc5A3a06231C5d0ED782E1995";
const AGENT_KEY = "5ee8b71aaf6a0a7fa57e32b8d3084ae00f4ffeda3833f15823c763b4d8b88899";
const DEPLOYER_KEY = "0x506994495db776d17deac4d56e69502b12e66ece1112b5a1e0a67923a0b45ebf";

async function main() {
  const provider = new hre.ethers.JsonRpcProvider("https://rpc.testnet.arc.network");
  const agentWallet = new hre.ethers.Wallet(AGENT_KEY, provider);
  const deployerWallet = new hre.ethers.Wallet(DEPLOYER_KEY, provider);

  console.log("=== Trigger Consensus V3 ===");
  console.log("Agent:", agentWallet.address);
  console.log("Deployer:", deployerWallet.address);
  console.log("Agent balance:", hre.ethers.formatEther(await provider.getBalance(agentWallet.address)));
  console.log("Deployer balance:", hre.ethers.formatEther(await provider.getBalance(deployerWallet.address)));

  const factory = await hre.ethers.getContractAt("DrachmaFactory", FACTORY, deployerWallet);
  const signalBusAgent = await hre.ethers.getContractAt("DrachmaSignalBus", SIGNAL_BUS, agentWallet);
  const signalBusDeployer = await hre.ethers.getContractAt("DrachmaSignalBus", SIGNAL_BUS, deployerWallet);

  // Check cooldown on signal type 0
  const lastConsensus0 = await signalBusDeployer.lastConsensusAt(0);
  const block = await provider.getBlock("latest");
  const now = block.timestamp;
  const cooldownEnd = Number(lastConsensus0) + 600; // COOLDOWN_PERIOD = 10 min = 600s
  const signalType = (now < cooldownEnd) ? 5 : 0; // Use YIELD_SPIKE(5) if type 0 is in cooldown
  const signalValues = (signalType === 0) ? [38, 40, 41] : [450, 455, 460]; // appropriate values
  console.log(`\nUsing signal type ${signalType} (${signalType === 0 ? 'EURC_SPREAD' : 'YIELD_SPIKE'})`);
  if (now < cooldownEnd) {
    console.log(`  (Type 0 in cooldown until ${cooldownEnd}, now=${now}, using type ${signalType} instead)`);
  }

  // === Step 1: Create 2 new vaults via the factory (deployer as agent) ===
  console.log("\n--- Step 1: Creating 2 new vaults via factory ---");
  const vaultAddresses = [];
  for (let i = 0; i < 2; i++) {
    console.log(`Creating vault ${i + 1}...`);
    const tx = await factory.createVault(
      deployerWallet.address,
      2000, 6000,
      1000, 4000,
      2000, 5000,
      { gasLimit: 5000000 }
    );
    const receipt = await tx.wait();
    const vaultCreatedLog = receipt.logs.find(log => {
      try {
        return factory.interface.parseLog(log)?.name === "VaultCreated";
      } catch { return false; }
    });
    let vaultAddr;
    if (vaultCreatedLog) {
      vaultAddr = factory.interface.parseLog(vaultCreatedLog).args.vault;
    } else {
      const total = await factory.totalVaults();
      vaultAddr = await factory.allVaults(total - 1n);
    }
    vaultAddresses.push(vaultAddr);
    console.log(`  Vault ${i + 1}: ${vaultAddr} | tx: ${tx.hash}`);
  }

  // === Step 2: Subscribe vault 1 and submit signal ===
  // subscribe() sets agentToVault[deployer] = vault, so we switch between vaults
  console.log("\n--- Step 2: Subscribe vault 1 and submit signal ---");
  let subTx = await signalBusDeployer.subscribe(vaultAddresses[0], { gasLimit: 500000 });
  await subTx.wait();
  console.log(`  Subscribed to vault 1: ${vaultAddresses[0]}`);

  let sigTx = await signalBusDeployer.submitSignal(signalType, signalValues[0], { gasLimit: 2000000 });
  const receipt1 = await sigTx.wait();
  console.log(`  Signal from vault 1: type=${signalType}, value=${signalValues[0]} | tx: ${sigTx.hash}`);

  // === Step 3: Subscribe vault 2 and submit signal ===
  console.log("\n--- Step 3: Subscribe vault 2 and submit signal ---");
  subTx = await signalBusDeployer.subscribe(vaultAddresses[1], { gasLimit: 500000 });
  await subTx.wait();
  console.log(`  Subscribed to vault 2: ${vaultAddresses[1]}`);

  sigTx = await signalBusDeployer.submitSignal(signalType, signalValues[1], { gasLimit: 2000000 });
  const receipt2 = await sigTx.wait();
  console.log(`  Signal from vault 2: type=${signalType}, value=${signalValues[1]} | tx: ${sigTx.hash}`);

  // === Step 4: Submit signal from original agent (3rd unique vault) - triggers consensus ===
  console.log("\n--- Step 4: Submit signal from original vault (3rd unique vault) ---");
  const finalTx = await signalBusAgent.submitSignal(signalType, signalValues[2], { gasLimit: 2000000 });
  const finalReceipt = await finalTx.wait();
  console.log(`  Signal from original vault: type=${signalType}, value=${signalValues[2]} | tx: ${finalTx.hash}`);

  // === Step 5: Check for ConsensusReached event ===
  console.log("\n--- Step 5: Checking for ConsensusReached event ---");
  const signalBusIface = signalBusDeployer.interface;
  let consensusFound = false;
  let consensusTxHash = "";

  const allReceipts = [receipt1, receipt2, finalReceipt];
  for (const receipt of allReceipts) {
    for (const log of receipt.logs) {
      try {
        const parsed = signalBusIface.parseLog(log);
        if (parsed && parsed.name === "ConsensusReached") {
          consensusFound = true;
          consensusTxHash = receipt.hash;
          console.log("\n*** CONSENSUS REACHED! ***");
          console.log("  Signal Type:", parsed.args.signalType.toString());
          console.log("  Weighted Avg Value:", parsed.args.weightedAvgValue.toString());
          console.log("  Vault Count:", parsed.args.vaultCount.toString());
          console.log("  Consensus Index:", parsed.args.consensusIndex.toString());
          console.log("  Timestamp:", parsed.args.timestamp.toString());
          console.log("  Tx Hash:", receipt.hash);
        }
      } catch {}
    }
  }

  if (!consensusFound) {
    console.log("ConsensusReached NOT emitted in this run's tx logs (likely cooldown active).");
    console.log("Checking on-chain consensus history...");
    const totalConsensus = await signalBusDeployer.totalConsensusEvents();
    console.log("Total consensus events:", totalConsensus.toString());
    if (totalConsensus > 0n) {
      const last = await signalBusDeployer.consensusHistory(totalConsensus - 1n);
      console.log("\nLatest consensus event on-chain:");
      console.log("  Signal Type:", last.signalType.toString());
      console.log("  Weighted Avg Value:", last.weightedAvgValue.toString());
      console.log("  Vault Count:", last.vaultCount.toString());
      console.log("  Timestamp:", last.timestamp.toString());
      console.log("  (Consensus was previously reached; cooldown may have blocked new event)");
    }
  }

  // === Final State ===
  console.log("\n=== FINAL STATE ===");
  const totalSigs = await signalBusDeployer.totalSignals();
  const totalConsensus = await signalBusDeployer.totalConsensusEvents();
  console.log("Total signals:", totalSigs.toString());
  console.log("Total consensus events:", totalConsensus.toString());
  if (consensusTxHash) {
    console.log("Consensus tx:", "https://testnet.arcscan.app/tx/" + consensusTxHash);
  }
  console.log("Signal Bus:", "https://testnet.arcscan.app/address/" + SIGNAL_BUS);
  console.log("Factory:", "https://testnet.arcscan.app/address/" + FACTORY);
  console.log("Original Vault:", ORIGINAL_VAULT);
  console.log("New Vault 1:", vaultAddresses[0]);
  console.log("New Vault 2:", vaultAddresses[1]);
}

main().catch(e => { console.error(e); process.exitCode = 1; });
