const hre = require("hardhat");

const VAULT = "0xD3D5b81b28b51aDdc5A3a06231C5d0ED782E1995";
const SIGNAL_BUS = "0xE66b90e5be9Fd497e2b0c57FF4a9F8A3b32f3Ff6";
const AGENT_KEY = "5ee8b71aaf6a0a7fa57e32b8d3084ae00f4ffeda3833f15823c763b4d8b88899";

async function main() {
  const provider = new hre.ethers.JsonRpcProvider("https://rpc.testnet.arc.network");
  const agent = new hre.ethers.Wallet(AGENT_KEY, provider);
  const vault = await hre.ethers.getContractAt("DrachmaVault", VAULT, agent);
  const signalBus = await hre.ethers.getContractAt("DrachmaSignalBus", SIGNAL_BUS, agent);

  // More rebalances (days 6-7)
  console.log("Running additional rebalances...");
  const rebalances = [
    { u: 3500, e: 2500, y: 4000, cid: "QmRebalW1D6Sched011", trigger: 0, sig: 0 },
    { u: 3000, e: 2000, y: 5000, cid: "QmRebalW1D6Yield012", trigger: 0, sig: 0 },
    { u: 4000, e: 2000, y: 4000, cid: "QmRebalW1D6Sched013", trigger: 0, sig: 0 },
    { u: 3500, e: 3000, y: 3500, cid: "QmRebalW1D7Conse014", trigger: 1, sig: 35 },
    { u: 4500, e: 2000, y: 3500, cid: "QmRebalW1D7Sched015", trigger: 0, sig: 0 },
    { u: 5000, e: 1000, y: 4000, cid: "QmRebalW1D7Urgen016", trigger: 2, sig: -40 },
    { u: 4000, e: 2000, y: 4000, cid: "QmRebalW1D7Sched017", trigger: 0, sig: 0 },
    { u: 3500, e: 2500, y: 4000, cid: "QmRebalW1D7Sched018", trigger: 0, sig: 0 },
    { u: 3000, e: 3000, y: 4000, cid: "QmRebalW2D1Conse019", trigger: 1, sig: 42 },
    { u: 4000, e: 2000, y: 4000, cid: "QmRebalW2D1Sched020", trigger: 0, sig: 0 },
    { u: 3500, e: 1500, y: 5000, cid: "QmRebalW2D1Yield021", trigger: 0, sig: 0 },
    { u: 4000, e: 2000, y: 4000, cid: "QmRebalW2D1Sched022", trigger: 0, sig: 0 },
    { u: 3000, e: 2500, y: 4500, cid: "QmRebalW2D2Sched023", trigger: 0, sig: 0 },
    { u: 4500, e: 1500, y: 4000, cid: "QmRebalW2D2Conv024", trigger: 3, sig: 0 },
    { u: 4000, e: 2000, y: 4000, cid: "QmRebalW2D2Sched025", trigger: 0, sig: 0 },
    { u: 3500, e: 2500, y: 4000, cid: "QmRebalW2D3Sched026", trigger: 0, sig: 0 },
    { u: 3000, e: 3000, y: 4000, cid: "QmRebalW2D3Conse027", trigger: 1, sig: 39 },
    { u: 4000, e: 2000, y: 4000, cid: "QmRebalW2D3Sched028", trigger: 0, sig: 0 },
  ];

  let success = 0;
  for (const r of rebalances) {
    try {
      const cid = hre.ethers.encodeBytes32String(r.cid);
      const tx = await vault.rebalance(r.u, r.e, r.y, cid, 0, r.trigger, r.sig, { gasLimit: 1500000 });
      await tx.wait();
      success++;
    } catch(e) { console.log("  Failed:", r.cid); }
  }
  console.log(`${success}/${rebalances.length} rebalances done`);

  // More signals
  console.log("Submitting additional signals...");
  const signals = [
    {t:0,v:36},{t:0,v:39},{t:0,v:42},{t:1,v:1025},{t:5,v:455},
    {t:4,v:-30},{t:2,v:18},{t:3,v:90},{t:0,v:37},{t:5,v:448},
    {t:0,v:34},{t:1,v:1018},{t:4,v:10},{t:2,v:12},{t:0,v:40},
    {t:5,v:462},{t:3,v:75},{t:0,v:43},{t:1,v:1022},{t:0,v:31},
  ];
  let sigSuccess = 0;
  for (const s of signals) {
    try {
      const tx = await signalBus.submitSignal(s.t, s.v, { gasLimit: 500000 });
      await tx.wait();
      sigSuccess++;
    } catch(e) {}
  }
  console.log(`${sigSuccess}/${signals.length} signals done`);

  // Final NAV
  await (await vault.updateNav({ gasLimit: 300000 })).wait();
  
  console.log("\nFinal state:");
  console.log("  Decisions:", (await vault.decisionLogLength()).toString());
  console.log("  Signals:", (await signalBus.totalSignals()).toString());
  console.log("  NAV/share:", (await vault.navPerShare()).toString());
  console.log("  Consensus events:", (await signalBus.totalConsensusEvents()).toString());
}

main().catch(e => { console.error(e); process.exitCode = 1; });
