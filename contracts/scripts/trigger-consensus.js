const hre = require("hardhat");

const SIGNAL_BUS = "0x469ad59A4dcdFe4393d732dfE2f318bA2442ee12";
const FACTORY = "0x6F4DF8979a8f18Ce3fD2ff941e5a3610E5cAfCa5";

function randomCID() {
  return "0x" + [...Array(64)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
}

async function main() {
  const deployerWallet = new hre.ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, hre.ethers.provider);
  const originalAgent = new hre.ethers.Wallet(process.env.AGENT_PRIVATE_KEY, hre.ethers.provider);

  const signalBus = await hre.ethers.getContractAt("DrachmaSignalBus", SIGNAL_BUS, originalAgent);
  const factory = await hre.ethers.getContractAt("DrachmaFactory", FACTORY, deployerWallet);

  console.log("=== CONSENSUS TRIGGER ===\n");
  console.log("Agent balance:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(originalAgent.address)), "USDC");

  // Create 4 deterministic agent wallets
  const newAgents = [];
  for (let i = 0; i < 4; i++) {
    const seed = hre.ethers.keccak256(hre.ethers.toUtf8Bytes(`drachma-consensus-v2-${i}`));
    const wallet = new hre.ethers.Wallet(seed, hre.ethers.provider);
    newAgents.push(wallet);
  }

  // Fund from agent wallet (has 19+ USDC)
  console.log("\nFunding 4 new agents from agent wallet (1 USDC each)...");
  for (const agent of newAgents) {
    const tx = await originalAgent.sendTransaction({
      to: agent.address,
      value: hre.ethers.parseEther("1")
    });
    await tx.wait();
    console.log(`  Funded: ${agent.address.slice(0,12)}...`);
  }

  // Create vaults via factory (deployer is factory caller)
  console.log("\nCreating 4 vaults...");
  const newVaults = [];
  for (let i = 0; i < 4; i++) {
    const tx = await factory.createVault(newAgents[i].address, 0, 10000, 0, 5000, 0, 5000);
    const receipt = await tx.wait();
    const event = receipt.logs.find(l => {
      try { return factory.interface.parseLog(l)?.name === "VaultCreated"; } catch { return false; }
    });
    const parsed = factory.interface.parseLog(event);
    newVaults.push(parsed.args.vault);
    console.log(`  Vault ${i+6}: ${parsed.args.vault}`);
  }

  // Subscribe
  console.log("\nSubscribing vaults...");
  for (let i = 0; i < 4; i++) {
    const bus = signalBus.connect(newAgents[i]);
    const tx = await bus.subscribe(newVaults[i]);
    await tx.wait();
  }
  const subs = await signalBus.registeredVaultCount();
  console.log(`Subscribed. Total subscribers: ${subs}`);

  // --- TRIGGER CONSENSUS ---
  // We now have original agent + 4 new agents = 5 total subscribers
  // Need 3+ unique vaults for consensus
  console.log("\n=== TRIGGERING CONSENSUS EVENTS ===\n");

  const scenarios = [
    { type: 0, name: "EURC_SPREAD", values: [55, 60, 48, 52, 63] },
    { type: 3, name: "DEPEG_CRITICAL", values: [-200, -180, -220, -190, -210] },
    { type: 5, name: "YIELD_SPIKE", values: [180, 165, 195, 175, 190] },
    { type: 4, name: "MACRO_ALERT", values: [85, 78, 92, 80, 88] },
    { type: 2, name: "STABLFX_THIN", values: [95, 88, 102, 90, 97] },
    { type: 1, name: "USYC_NAV", values: [-18, -15, -22, -12, -20] },
  ];

  for (const scenario of scenarios) {
    console.log(`--- ${scenario.name} (type=${scenario.type}) ---`);

    // Original agent first
    const tx0 = await signalBus.submitSignal(scenario.type, scenario.values[0]);
    await tx0.wait();
    console.log(`  Original: value=${scenario.values[0]}`);

    // 4 new agents
    for (let i = 0; i < 4; i++) {
      const bus = signalBus.connect(newAgents[i]);
      const tx = await bus.submitSignal(scenario.type, scenario.values[i+1]);
      await tx.wait();
      console.log(`  Agent ${i+2}: value=${scenario.values[i+1]}`);
    }

    const c = await signalBus.totalConsensusEvents();
    console.log(`  ✓ Total consensus events: ${c}\n`);
  }

  // --- Additional mixed signals for density ---
  console.log("--- Extra signals batch (24 signals) ---");
  let extraCount = 0;
  for (let type = 0; type <= 5; type++) {
    // 2 signals per type from original
    for (let j = 0; j < 2; j++) {
      const val = type === 3 || type === 1 ? -(10 + Math.floor(Math.random() * 40)) : (10 + Math.floor(Math.random() * 80));
      try {
        const tx = await signalBus.submitSignal(type, val);
        await tx.wait();
        extraCount++;
      } catch (e) {}
    }
    // 2 from random new agent
    for (let j = 0; j < 2; j++) {
      const agentIdx = Math.floor(Math.random() * 4);
      const bus = signalBus.connect(newAgents[agentIdx]);
      const val = type === 3 || type === 1 ? -(10 + Math.floor(Math.random() * 40)) : (10 + Math.floor(Math.random() * 80));
      try {
        const tx = await bus.submitSignal(type, val);
        await tx.wait();
        extraCount++;
      } catch (e) {}
    }
  }
  console.log(`Submitted ${extraCount} extra signals`);

  // --- Score updates ---
  console.log("\n--- Score updates for new vaults ---");
  const scoreValues = [580, 650, 720, 790];
  for (let i = 0; i < 4; i++) {
    const v = await hre.ethers.getContractAt("DrachmaVault", newVaults[i], newAgents[i]);
    const tx = await v.updateReserveScore(scoreValues[i], randomCID());
    await tx.wait();
    console.log(`  Vault ${i+6} score → ${scoreValues[i]}`);
  }

  // --- Final Summary ---
  console.log("\n=== FINAL NETWORK STATE ===");
  const totalVaults = await factory.totalVaults();
  const finalSigs = await signalBus.totalSignals();
  const finalConsensus = await signalBus.totalConsensusEvents();
  const finalSubs = await signalBus.registeredVaultCount();

  console.log("Total vaults:", totalVaults.toString());
  console.log("Subscribed vaults:", finalSubs.toString());
  console.log("Total signals:", finalSigs.toString());
  console.log("CONSENSUS EVENTS:", finalConsensus.toString());

  if (finalConsensus > 0n) {
    console.log("\nConsensus history:");
    for (let i = 0; i < Number(finalConsensus); i++) {
      const ev = await signalBus.consensusHistory(i);
      const typeNames = ["EURC_SPREAD", "USYC_NAV", "STABLFX_THIN", "DEPEG_CRITICAL", "MACRO_ALERT", "YIELD_SPIKE"];
      console.log(`  [${i}] ${typeNames[ev.signalType]} | avgValue=${ev.weightedAvgValue} | vaults=${ev.vaultCount}`);
    }
  }

  console.log("\nAll vaults:");
  for (let i = 0; i < Number(totalVaults); i++) {
    const v = await factory.allVaults(i);
    console.log(`  ${i+1}. ${v}`);
  }

  console.log("\nDone!");
}

main().catch(e => { console.error(e); process.exit(1); });
