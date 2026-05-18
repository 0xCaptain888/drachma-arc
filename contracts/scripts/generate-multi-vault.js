const hre = require("hardhat");

const SIGNAL_BUS = "0x469ad59A4dcdFe4393d732dfE2f318bA2442ee12";
const SCORE_ORACLE = "0x0b489F9988C52F72BdEC5F8d55b1fD390B8Cd41D";
const FACTORY = "0x6F4DF8979a8f18Ce3fD2ff941e5a3610E5cAfCa5";

function randomCID() {
  const hex = [...Array(64)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
  return "0x" + hex;
}

async function main() {
  const DEPLOYER_KEY = process.env.DEPLOYER_PRIVATE_KEY;
  const deployerWallet = new hre.ethers.Wallet(DEPLOYER_KEY, hre.ethers.provider);

  const factory = await hre.ethers.getContractAt("DrachmaFactory", FACTORY, deployerWallet);
  const signalBus = await hre.ethers.getContractAt("DrachmaSignalBus", SIGNAL_BUS, deployerWallet);

  console.log("=== MULTI-VAULT DEPLOYMENT + CONSENSUS GENERATION ===\n");

  // --- Create 4 additional vaults with unique agents ---
  console.log("--- Deploying 4 additional vaults ---");
  const agentKeys = [];
  const agents = [];
  const vaults = [];

  for (let i = 1; i <= 4; i++) {
    const wallet = hre.ethers.Wallet.createRandom().connect(hre.ethers.provider);
    agentKeys.push(wallet);
    agents.push(wallet.address);
  }

  // Fund agent wallets — Arc native USDC uses 18 decimals for gas
  console.log("Funding agent wallets (0.01 native USDC each)...");
  for (let i = 0; i < 4; i++) {
    const tx = await deployerWallet.sendTransaction({
      to: agents[i],
      value: hre.ethers.parseEther("0.01") // 0.01 USDC in 18 decimal wei
    });
    await tx.wait();
    console.log(`Funded agent ${i+2}: ${agents[i]}`);
  }

  // Use already-deployed vaults from the previous run
  const totalExisting = await factory.totalVaults();
  console.log(`\nExisting vaults: ${totalExisting}`);

  // If vaults 2-5 already exist, use them; otherwise create new ones
  if (totalExisting >= 5n) {
    console.log("Using existing vaults 2-5...");
    for (let i = 1; i < 5; i++) {
      vaults.push(await factory.allVaults(i));
    }
    // These vaults have different agents, so we need to create NEW vaults with our new agents
    console.log("Creating 4 more vaults with new agents...");
    for (let i = 0; i < 4; i++) {
      try {
        const tx = await factory.createVault(agents[i], 0, 10000, 0, 5000, 0, 5000);
        const receipt = await tx.wait();
        const event = receipt.logs.find(l => {
          try { return factory.interface.parseLog(l)?.name === "VaultCreated"; } catch { return false; }
        });
        const parsed = factory.interface.parseLog(event);
        vaults[i] = parsed.args.vault;
        console.log(`New Vault: ${parsed.args.vault} (agent: ${agents[i].slice(0,10)}...)`);
      } catch (e) {
        console.log(`Vault creation FAILED: ${e.message.slice(0, 100)}`);
      }
    }
  } else {
    // Create fresh
    for (let i = 0; i < 4; i++) {
      try {
        const tx = await factory.createVault(agents[i], 0, 10000, 0, 5000, 0, 5000);
        const receipt = await tx.wait();
        const event = receipt.logs.find(l => {
          try { return factory.interface.parseLog(l)?.name === "VaultCreated"; } catch { return false; }
        });
        const parsed = factory.interface.parseLog(event);
        vaults.push(parsed.args.vault);
        console.log(`Vault: ${parsed.args.vault} (agent: ${agents[i].slice(0,10)}...)`);
      } catch (e) {
        console.log(`Vault creation FAILED: ${e.message.slice(0, 100)}`);
      }
    }
  }

  const totalVaults = await factory.totalVaults();
  console.log(`\nTotal vaults now: ${totalVaults}`);

  // --- Subscribe all new vaults to SignalBus ---
  console.log("\n--- Subscribing vaults to SignalBus ---");
  for (let i = 0; i < vaults.length; i++) {
    try {
      const agentBus = signalBus.connect(agentKeys[i]);
      const tx = await agentBus.subscribe(vaults[i]);
      await tx.wait();
      console.log(`Vault ${vaults[i].slice(0,10)}... subscribed`);
    } catch (e) {
      console.log(`Subscribe FAILED for vault ${i}: ${e.message.slice(0, 100)}`);
    }
  }

  const subs = await signalBus.registeredVaultCount();
  console.log(`Total subscribers: ${subs}`);

  // --- Submit signals from all agents to trigger CONSENSUS ---
  console.log("\n--- Triggering Consensus Events ---");
  console.log("Need 3+ unique vaults reporting same signal type within 30min window\n");

  const originalAgent = new hre.ethers.Wallet(process.env.AGENT_PRIVATE_KEY, hre.ethers.provider);
  const originalBus = signalBus.connect(originalAgent);

  // Consensus scenario 1: EURC_SPREAD
  console.log("=== Scenario 1: EURC_SPREAD ===");
  try {
    let tx = await originalBus.submitSignal(0, 55);
    await tx.wait();
    console.log("Original agent: EURC_SPREAD=55");
  } catch (e) {
    console.log("Original signal failed:", e.message.slice(0, 80));
  }

  for (let i = 0; i < Math.min(3, agentKeys.length); i++) {
    try {
      const agentBus = signalBus.connect(agentKeys[i]);
      const value = 50 + Math.floor(Math.random() * 20);
      const tx = await agentBus.submitSignal(0, value);
      await tx.wait();
      console.log(`Agent ${i+2}: EURC_SPREAD=${value}`);
    } catch (e) {
      console.log(`Agent ${i+2} signal FAILED: ${e.message.slice(0, 80)}`);
    }
  }
  let consensus = await signalBus.totalConsensusEvents();
  console.log(`Consensus events: ${consensus}\n`);

  // Consensus scenario 2: DEPEG_CRITICAL
  console.log("=== Scenario 2: DEPEG_CRITICAL ===");
  try {
    let tx = await originalBus.submitSignal(3, -190);
    await tx.wait();
    console.log("Original agent: DEPEG_CRITICAL=-190");
  } catch (e) {
    console.log("Original signal failed:", e.message.slice(0, 80));
  }

  for (let i = 0; i < Math.min(3, agentKeys.length); i++) {
    try {
      const agentBus = signalBus.connect(agentKeys[i]);
      const value = -(180 + Math.floor(Math.random() * 80));
      const tx = await agentBus.submitSignal(3, value);
      await tx.wait();
      console.log(`Agent ${i+2}: DEPEG_CRITICAL=${value}`);
    } catch (e) {
      console.log(`Agent ${i+2} signal FAILED: ${e.message.slice(0, 80)}`);
    }
  }
  consensus = await signalBus.totalConsensusEvents();
  console.log(`Consensus events: ${consensus}\n`);

  // Consensus scenario 3: YIELD_SPIKE
  console.log("=== Scenario 3: YIELD_SPIKE ===");
  try {
    let tx = await originalBus.submitSignal(5, 180);
    await tx.wait();
    console.log("Original agent: YIELD_SPIKE=180");
  } catch (e) {
    console.log("Original signal failed:", e.message.slice(0, 80));
  }

  for (let i = 0; i < Math.min(3, agentKeys.length); i++) {
    try {
      const agentBus = signalBus.connect(agentKeys[i]);
      const value = 150 + Math.floor(Math.random() * 100);
      const tx = await agentBus.submitSignal(5, value);
      await tx.wait();
      console.log(`Agent ${i+2}: YIELD_SPIKE=${value}`);
    } catch (e) {
      console.log(`Agent ${i+2} signal FAILED: ${e.message.slice(0, 80)}`);
    }
  }
  consensus = await signalBus.totalConsensusEvents();
  console.log(`Consensus events: ${consensus}\n`);

  // Consensus scenario 4: MACRO_ALERT
  console.log("=== Scenario 4: MACRO_ALERT ===");
  try {
    let tx = await originalBus.submitSignal(4, 85);
    await tx.wait();
    console.log("Original agent: MACRO_ALERT=85");
  } catch (e) {
    console.log("Original signal failed:", e.message.slice(0, 80));
  }

  for (let i = 0; i < Math.min(3, agentKeys.length); i++) {
    try {
      const agentBus = signalBus.connect(agentKeys[i]);
      const value = 70 + Math.floor(Math.random() * 40);
      const tx = await agentBus.submitSignal(4, value);
      await tx.wait();
      console.log(`Agent ${i+2}: MACRO_ALERT=${value}`);
    } catch (e) {
      console.log(`Agent ${i+2} signal FAILED: ${e.message.slice(0, 80)}`);
    }
  }
  consensus = await signalBus.totalConsensusEvents();
  console.log(`Consensus events: ${consensus}\n`);

  // Consensus scenario 5: STABLFX_THIN
  console.log("=== Scenario 5: STABLFX_THIN ===");
  try {
    let tx = await originalBus.submitSignal(2, 95);
    await tx.wait();
    console.log("Original agent: STABLFX_THIN=95");
  } catch (e) {
    console.log("Original signal failed:", e.message.slice(0, 80));
  }

  for (let i = 0; i < Math.min(3, agentKeys.length); i++) {
    try {
      const agentBus = signalBus.connect(agentKeys[i]);
      const value = 80 + Math.floor(Math.random() * 30);
      const tx = await agentBus.submitSignal(2, value);
      await tx.wait();
      console.log(`Agent ${i+2}: STABLFX_THIN=${value}`);
    } catch (e) {
      console.log(`Agent ${i+2} signal FAILED: ${e.message.slice(0, 80)}`);
    }
  }
  consensus = await signalBus.totalConsensusEvents();
  console.log(`Consensus events: ${consensus}\n`);

  // Consensus scenario 6: USYC_NAV
  console.log("=== Scenario 6: USYC_NAV ===");
  try {
    let tx = await originalBus.submitSignal(1, -18);
    await tx.wait();
    console.log("Original agent: USYC_NAV=-18");
  } catch (e) {
    console.log("Original signal failed:", e.message.slice(0, 80));
  }

  for (let i = 0; i < Math.min(3, agentKeys.length); i++) {
    try {
      const agentBus = signalBus.connect(agentKeys[i]);
      const value = -(10 + Math.floor(Math.random() * 15));
      const tx = await agentBus.submitSignal(1, value);
      await tx.wait();
      console.log(`Agent ${i+2}: USYC_NAV=${value}`);
    } catch (e) {
      console.log(`Agent ${i+2} signal FAILED: ${e.message.slice(0, 80)}`);
    }
  }
  consensus = await signalBus.totalConsensusEvents();
  console.log(`Consensus events: ${consensus}\n`);

  // --- Score updates for new vaults ---
  console.log("--- Score updates for new vaults ---");
  for (let i = 0; i < vaults.length; i++) {
    try {
      const v = await hre.ethers.getContractAt("DrachmaVault", vaults[i], agentKeys[i]);
      const scoreValues = [550, 620, 700, 760];
      const tx = await v.updateReserveScore(scoreValues[i], randomCID());
      await tx.wait();
      console.log(`Vault ${i+2} score → ${scoreValues[i]}`);
    } catch (e) {
      console.log(`Vault ${i+2} score update FAILED: ${e.message.slice(0, 80)}`);
    }
  }

  // --- Final Summary ---
  console.log("\n=== FINAL NETWORK STATE ===");
  const finalVaults = await factory.totalVaults();
  const finalSigs = await signalBus.totalSignals();
  const finalConsensus = await signalBus.totalConsensusEvents();
  const finalSubs = await signalBus.registeredVaultCount();

  console.log("Total vaults:", finalVaults.toString());
  console.log("Subscribed vaults:", finalSubs.toString());
  console.log("Total signals:", finalSigs.toString());
  console.log("Consensus events:", finalConsensus.toString());

  console.log("\nAll vault addresses:");
  for (let i = 0; i < Number(finalVaults); i++) {
    const v = await factory.allVaults(i);
    console.log(`  Vault ${i+1}: ${v}`);
  }

  console.log("\nDone!");
}

main().catch(e => { console.error(e); process.exit(1); });
