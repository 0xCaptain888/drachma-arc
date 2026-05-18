const hre = require("hardhat");

const VAULT = "0xD3D5b81b28b51aDdc5A3a06231C5d0ED782E1995";
const SIGNAL_BUS = "0xE66b90e5be9Fd497e2b0c57FF4a9F8A3b32f3Ff6";
const SCORE_ORACLE = "0xF1d8e224755c609AdF735CaEd3c45CEC0391337B";
const USDC_ADDR = "0xCa8c2F63dde30f09e6F3192687e7C87cb15C3aC4";
const EURC_ADDR = "0xb6b77cbf76080f6Dd4ecA23E089771d53B1fEe35";
const USYC_ADDR = "0x1dbDE8D5AFf868DCaa11cb19B39d25191Be699E3";
const AGENT_KEY = "5ee8b71aaf6a0a7fa57e32b8d3084ae00f4ffeda3833f15823c763b4d8b88899";
const DEPLOYER_KEY = "0x506994495db776d17deac4d56e69502b12e66ece1112b5a1e0a67923a0b45ebf";

async function main() {
  const provider = new hre.ethers.JsonRpcProvider("https://rpc.testnet.arc.network");
  const agent = new hre.ethers.Wallet(AGENT_KEY, provider);
  const deployer = new hre.ethers.Wallet(DEPLOYER_KEY, provider);
  
  const vault = await hre.ethers.getContractAt("DrachmaVault", VAULT, agent);
  const vaultOwner = await hre.ethers.getContractAt("DrachmaVault", VAULT, deployer);
  const signalBus = await hre.ethers.getContractAt("DrachmaSignalBus", SIGNAL_BUS, agent);
  const scoreOracle = await hre.ethers.getContractAt("DrachmaScoreOracle", SCORE_ORACLE, deployer);
  const usdc = await hre.ethers.getContractAt("MockERC20", USDC_ADDR, deployer);
  const eurc = await hre.ethers.getContractAt("MockERC20", EURC_ADDR, deployer);

  // === 1. Subscribe ===
  console.log("1. Subscribe vault...");
  await (await signalBus.subscribe(VAULT, { gasLimit: 200000 })).wait();
  console.log("   Done");

  // === 2. Deposit 1000 USDC ===
  console.log("\n2. Depositing 1000 USDC...");
  await (await usdc.approve(VAULT, 1000_000000n, { gasLimit: 100000 })).wait();
  const depTx = await vaultOwner.depositForShares(1000_000000n, { gasLimit: 300000 });
  await depTx.wait();
  console.log("   1000 USDC deposited, tx:", depTx.hash);
  console.log("   dUSDC minted:", hre.ethers.formatUnits(await vault.balanceOf(deployer.address), 6));

  // === 3. Run 10 rebalances ===
  console.log("\n3. Running 10 rebalance cycles...");
  const rebalances = [
    { u: 4000, e: 2000, y: 4000, cid: "QmRebalW1D1Sched001", trigger: 0, sig: 0 },
    { u: 3500, e: 2500, y: 4000, cid: "QmRebalW1D1Sched002", trigger: 0, sig: 0 },
    { u: 3000, e: 3000, y: 4000, cid: "QmRebalW1D2Conse003", trigger: 1, sig: 38 },
    { u: 4000, e: 2000, y: 4000, cid: "QmRebalW1D3Sched004", trigger: 0, sig: 0 },
    { u: 3500, e: 1500, y: 5000, cid: "QmRebalW1D3Yield005", trigger: 0, sig: 0 },
    { u: 4500, e: 1500, y: 4000, cid: "QmRebalW1D4Sched006", trigger: 0, sig: 0 },
    { u: 5000, e: 1000, y: 4000, cid: "QmRebalW1D4Urgen007", trigger: 2, sig: -50 },
    { u: 4000, e: 2000, y: 4000, cid: "QmRebalW1D5Sched008", trigger: 0, sig: 0 },
    { u: 3500, e: 2500, y: 4000, cid: "QmRebalW1D5Conse009", trigger: 1, sig: 41 },
    { u: 4000, e: 2000, y: 4000, cid: "QmRebalW1D6Sched010", trigger: 0, sig: 0 },
  ];

  for (let i = 0; i < rebalances.length; i++) {
    const r = rebalances[i];
    try {
      const cid = hre.ethers.encodeBytes32String(r.cid);
      const tx = await vault.rebalance(r.u, r.e, r.y, cid, 0, r.trigger, r.sig, { gasLimit: 1500000 });
      await tx.wait();
      console.log(`   [${i+1}] ${r.u/100}/${r.e/100}/${r.y/100}% trigger=${r.trigger} ✓`);
    } catch(e) {
      console.log(`   [${i+1}] FAILED: ${e.message.slice(0, 100)}`);
    }
  }

  // === 4. Submit 10 signals ===
  console.log("\n4. Submitting 10 signals...");
  const signals = [
    { type: 0, value: 38 }, { type: 0, value: 35 }, { type: 0, value: 41 },
    { type: 1, value: 1020 }, { type: 5, value: 450 }, { type: 4, value: -25 },
    { type: 2, value: 15 }, { type: 3, value: 80 }, { type: 0, value: 33 },
    { type: 5, value: 460 },
  ];
  for (const sig of signals) {
    const tx = await signalBus.submitSignal(sig.type, sig.value, { gasLimit: 500000 });
    await tx.wait();
    console.log(`   Signal(${sig.type}, ${sig.value}) ✓`);
  }

  // === 5. Score update ===
  console.log("\n5. DrachmaScore update...");
  const components = { yieldPerformance: 250, bandDiscipline: 220, riskResponse: 195, consistency: 165 };
  const evidenceCID = hre.ethers.encodeBytes32String("QmScoreW1Evidence");
  const now = Math.floor(Date.now() / 1000);
  const scoreTx = await scoreOracle.updateScore(VAULT, components, evidenceCID, now - 604800, now, { gasLimit: 300000 });
  await scoreTx.wait();
  console.log("   Score:", (await scoreOracle.getScore(VAULT)).toString(), "/ 1000");

  // === 6. Vault score sync ===
  console.log("\n6. Vault score sync...");
  const cid6 = hre.ethers.encodeBytes32String("QmVaultScoreSync");
  await (await vault.updateReserveScore(830, cid6, { gasLimit: 200000 })).wait();
  console.log("   Vault reserveScore: 830");

  // === 7. NAV Update ===
  console.log("\n7. NAV update...");
  const navTx = await vault.updateNav({ gasLimit: 300000 });
  await navTx.wait();
  console.log("   NAV per share:", (await vault.navPerShare()).toString());

  // === SUMMARY ===
  console.log("\n=== FINAL SUMMARY ===");
  const [u, e, y, t] = await vault.totalAum();
  console.log("USDC:", hre.ethers.formatUnits(u, 6));
  console.log("EURC:", hre.ethers.formatUnits(e, 6));
  console.log("USYC:", hre.ethers.formatUnits(y, 6));
  console.log("Total AUM (USDC):", hre.ethers.formatUnits(t, 6));
  console.log("Decisions:", (await vault.decisionLogLength()).toString());
  console.log("Signals:", (await signalBus.totalSignals()).toString());
  console.log("Score:", (await scoreOracle.getScore(VAULT)).toString());
  console.log("NAV/share:", (await vault.navPerShare()).toString());
  console.log("\nVault:", "https://testnet.arcscan.app/address/" + VAULT);
}

main().catch(e => { console.error(e); process.exitCode = 1; });
