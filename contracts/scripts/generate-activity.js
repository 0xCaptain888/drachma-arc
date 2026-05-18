const hre = require("hardhat");

// Deployed addresses
const SIGNAL_BUS = "0x469ad59A4dcdFe4393d732dfE2f318bA2442ee12";
const SCORE_ORACLE = "0x0b489F9988C52F72BdEC5F8d55b1fD390B8Cd41D";
const VAULT = "0xabDd1dB9293234FCa684FA90C7e0b047427cC7fc";
const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";

const SIGNAL_TYPES = {
  EURC_SPREAD: 0,
  USYC_NAV: 1,
  STABLFX_THIN: 2,
  DEPEG_CRITICAL: 3,
  MACRO_ALERT: 4,
  YIELD_SPIKE: 5
};

function randomCID() {
  const hex = [...Array(64)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
  return "0x" + hex;
}

async function main() {
  const AGENT_KEY = process.env.AGENT_PRIVATE_KEY;
  const DEPLOYER_KEY = process.env.DEPLOYER_PRIVATE_KEY;

  const agentWallet = new hre.ethers.Wallet(AGENT_KEY, hre.ethers.provider);
  const deployerWallet = new hre.ethers.Wallet(DEPLOYER_KEY, hre.ethers.provider);

  const signalBus = await hre.ethers.getContractAt("DrachmaSignalBus", SIGNAL_BUS, agentWallet);
  const vault = await hre.ethers.getContractAt("DrachmaVault", VAULT, agentWallet);
  const vaultOwner = vault.connect(deployerWallet);

  console.log("=== DRACHMA ON-CHAIN ACTIVITY GENERATOR ===\n");

  // --- Phase 1: USDC Deposit ---
  console.log("--- Phase 1: USDC Deposit ---");
  const usdc = await hre.ethers.getContractAt("DrachmaVault.sol:IERC20", USDC_ADDRESS, deployerWallet);
  const usdcBalance = await usdc.balanceOf(deployerWallet.address);
  console.log("Deployer USDC ERC20 balance:", hre.ethers.formatUnits(usdcBalance, 6));

  if (usdcBalance > 1_000000n) {
    // Leave 2 USDC buffer for gas-related issues, deposit the rest
    const depositAmount = usdcBalance - 2_000000n;
    console.log("Depositing", hre.ethers.formatUnits(depositAmount, 6), "USDC into vault...");
    try {
      const approveTx = await usdc.approve(VAULT, depositAmount);
      await approveTx.wait();
      const depTx = await vaultOwner.deposit(USDC_ADDRESS, depositAmount);
      await depTx.wait();
      console.log("Deposited. TX:", depTx.hash);
    } catch (e) {
      console.log("Deposit failed:", e.message.slice(0, 100));
    }
  } else {
    console.log("Insufficient ERC20 USDC for deposit — skipping.");
  }

  // --- Phase 2: dUSDC depositForShares ---
  console.log("\n--- Phase 2: dUSDC Shares ---");
  const usdcBalAfter = await usdc.balanceOf(deployerWallet.address);
  if (usdcBalAfter > 1_000000n) {
    const shareAmount = usdcBalAfter - 1_000000n;
    try {
      const approveTx2 = await usdc.approve(VAULT, shareAmount);
      await approveTx2.wait();
      const shareTx = await vaultOwner.depositForShares(shareAmount);
      await shareTx.wait();
      const shares = await vault.balanceOf(deployerWallet.address);
      console.log("depositForShares:", hre.ethers.formatUnits(shareAmount, 6), "USDC →", hre.ethers.formatUnits(shares, 6), "dUSDC");
      console.log("TX:", shareTx.hash);
    } catch (e) {
      console.log("depositForShares failed:", e.message.slice(0, 100));
    }
  }

  // Check vault AUM
  const aum = await vault.totalAum();
  console.log("Vault AUM (USDC):", hre.ethers.formatUnits(aum[3], 6));

  // --- Phase 3: Signal Submissions (30 signals across all types) ---
  console.log("\n--- Phase 3: Signal Submissions (30 signals) ---");
  const signalData = [
    { type: 0, value: 15 }, { type: 0, value: 22 }, { type: 0, value: 35 },
    { type: 0, value: 48 }, { type: 0, value: 52 },
    { type: 1, value: -5 }, { type: 1, value: -8 }, { type: 1, value: 3 },
    { type: 1, value: -12 }, { type: 1, value: -15 },
    { type: 2, value: 45 }, { type: 2, value: 60 }, { type: 2, value: 72 },
    { type: 2, value: 85 }, { type: 2, value: 90 },
    { type: 3, value: -150 }, { type: 3, value: -200 }, { type: 3, value: -300 },
    { type: 3, value: -180 }, { type: 3, value: -250 },
    { type: 4, value: 30 }, { type: 4, value: 45 }, { type: 4, value: 55 },
    { type: 4, value: 70 }, { type: 4, value: 80 },
    { type: 5, value: 80 }, { type: 5, value: 120 }, { type: 5, value: 95 },
    { type: 5, value: 150 }, { type: 5, value: 200 },
  ];

  for (let i = 0; i < signalData.length; i++) {
    const { type, value } = signalData[i];
    const typeName = Object.keys(SIGNAL_TYPES).find(k => SIGNAL_TYPES[k] === type);
    try {
      const tx = await signalBus.submitSignal(type, value);
      await tx.wait();
      console.log(`[${i+1}/30] Signal ${typeName} value=${value} TX: ${tx.hash}`);
    } catch (e) {
      console.log(`[${i+1}/30] Signal FAILED: ${e.message.slice(0, 80)}`);
    }
  }

  const totalSigs = await signalBus.totalSignals();
  const totalConsensus = await signalBus.totalConsensusEvents();
  console.log(`Total signals: ${totalSigs}, Consensus events: ${totalConsensus}`);

  // --- Phase 4: Reserve Score Updates (12 updates — simulate weekly progression) ---
  console.log("\n--- Phase 4: Reserve Score Updates (12 updates) ---");
  const scores = [520, 545, 580, 610, 625, 660, 690, 720, 745, 755, 780, 810];
  for (let i = 0; i < scores.length; i++) {
    const cid = randomCID();
    const tx = await vault.updateReserveScore(scores[i], cid);
    await tx.wait();
    console.log(`[${i+1}/12] Score → ${scores[i]} TX: ${tx.hash}`);
  }

  // --- Phase 5: NAV Updates (5 updates) ---
  console.log("\n--- Phase 5: NAV Updates (5 updates) ---");
  for (let i = 0; i < 5; i++) {
    const tx = await vault.updateNav();
    await tx.wait();
    const nav = await vault.navPerShare();
    console.log(`[${i+1}/5] NAV: ${nav.toString()} TX: ${tx.hash}`);
  }

  // --- Phase 6: Rebalances ---
  const aumCheck = await vault.totalAum();
  if (aumCheck[3] > 0n) {
    console.log("\n--- Phase 6: Rebalances (8 rebalances) ---");
    // All 100% USDC since vault only holds USDC (no actual StableFX/USYC on testnet)
    // Target within bands: USDC 2000-6000, EURC 1000-4000, USYC 2000-6000
    // Since actual rebalance swaps will fail (no liquidity), use 100% USDC allocation
    // Actually, we need to check — the rebalance function calls external contracts
    // Let's try a "no-op" rebalance where targets match current allocation
    const rebalances = [
      { usdc: 6000, eurc: 1000, usyc: 3000, trigger: 0, signal: 0, desc: "scheduled" },
      { usdc: 5500, eurc: 1500, usyc: 3000, trigger: 0, signal: 15, desc: "scheduled+signal" },
      { usdc: 5000, eurc: 2000, usyc: 3000, trigger: 1, signal: -50, desc: "consensus" },
      { usdc: 4500, eurc: 2500, usyc: 3000, trigger: 2, signal: -200, desc: "urgent" },
      { usdc: 4000, eurc: 1500, usyc: 4500, trigger: 3, signal: 0, desc: "conversation" },
      { usdc: 5500, eurc: 2000, usyc: 2500, trigger: 0, signal: 25, desc: "scheduled" },
      { usdc: 3500, eurc: 2500, usyc: 4000, trigger: 1, signal: -100, desc: "consensus" },
      { usdc: 6000, eurc: 2000, usyc: 2000, trigger: 2, signal: -350, desc: "emergency prep" },
    ];

    for (let i = 0; i < rebalances.length; i++) {
      const r = rebalances[i];
      const cid = randomCID();
      try {
        const tx = await vault.rebalance(
          r.usdc, r.eurc, r.usyc, cid, 0, r.trigger, r.signal
        );
        await tx.wait();
        console.log(`[${i+1}/8] Rebalance (${r.desc}) ${r.usdc}/${r.eurc}/${r.usyc} TX: ${tx.hash}`);
      } catch (e) {
        console.log(`[${i+1}/8] Rebalance (${r.desc}) FAILED: ${e.message.slice(0, 120)}`);
      }
    }
  } else {
    console.log("\n--- Phase 6: Skipped (vault has no AUM for rebalance) ---");
  }

  // --- Phase 7: Emergency Exit ---
  console.log("\n--- Phase 7: Emergency Exit ---");
  try {
    const exitCid = randomCID();
    const tx = await vault.emergencyExit(exitCid);
    await tx.wait();
    console.log("Emergency exit TX:", tx.hash);
  } catch (e) {
    console.log("Emergency exit FAILED:", e.message.slice(0, 100));
  }

  // --- Phase 8: Score Oracle direct updates ---
  console.log("\n--- Phase 8: ScoreOracle Updates ---");
  const scoreOracle = await hre.ethers.getContractAt("DrachmaScoreOracle", SCORE_ORACLE, agentWallet);
  const oracleScores = [650, 720, 785, 830, 860, 890];
  for (let i = 0; i < oracleScores.length; i++) {
    try {
      const tx = await scoreOracle.updateScore(VAULT, oracleScores[i], randomCID());
      await tx.wait();
      console.log(`[${i+1}/6] Oracle score → ${oracleScores[i]} TX: ${tx.hash}`);
    } catch (e) {
      console.log(`[${i+1}/6] Oracle update FAILED: ${e.message.slice(0, 100)}`);
    }
  }

  // --- Phase 9: More signals (batch 2 for density) ---
  console.log("\n--- Phase 9: Additional Signals (20 more) ---");
  const moreSignals = [
    { type: 0, value: 10 }, { type: 0, value: 18 }, { type: 0, value: 42 },
    { type: 1, value: -3 }, { type: 1, value: 7 }, { type: 1, value: -20 },
    { type: 2, value: 30 }, { type: 2, value: 55 }, { type: 2, value: 100 },
    { type: 3, value: -120 }, { type: 3, value: -400 }, { type: 3, value: -95 },
    { type: 4, value: 20 }, { type: 4, value: 65 }, { type: 4, value: 90 },
    { type: 5, value: 50 }, { type: 5, value: 175 }, { type: 5, value: 250 },
    { type: 0, value: 65 }, { type: 3, value: -500 },
  ];
  for (let i = 0; i < moreSignals.length; i++) {
    const { type, value } = moreSignals[i];
    const typeName = Object.keys(SIGNAL_TYPES).find(k => SIGNAL_TYPES[k] === type);
    try {
      const tx = await signalBus.submitSignal(type, value);
      await tx.wait();
      console.log(`[${i+1}/20] Signal ${typeName} value=${value} TX: ${tx.hash}`);
    } catch (e) {
      console.log(`[${i+1}/20] Signal FAILED: ${e.message.slice(0, 80)}`);
    }
  }

  // --- Final State ---
  console.log("\n=== FINAL STATE ===");
  const finalScore = await vault.reserveScore();
  const finalNav = await vault.navPerShare();
  const finalSupply = await vault.totalSupply();
  const logLen = await vault.decisionLogLength();
  const finalSigs = await signalBus.totalSignals();
  const finalConsensus = await signalBus.totalConsensusEvents();

  console.log("Reserve Score:", finalScore.toString());
  console.log("NAV per Share:", finalNav.toString());
  console.log("dUSDC Supply:", hre.ethers.formatUnits(finalSupply, 6));
  console.log("Decision Log entries:", logLen.toString());
  console.log("Total Signals:", finalSigs.toString());
  console.log("Consensus Events:", finalConsensus.toString());
  console.log("\nDone! All on-chain activity generated.");
}

main().catch(e => { console.error(e); process.exit(1); });
