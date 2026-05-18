const hre = require("hardhat");

async function main() {
  const signalBusAddr = "0x65dA5f7aC697EFD8d76C8248a2bCe5b09872BE86";
  const vaultAddr = "0x4D2dc79fA805448a388c60F46dAd6907d7ec91b3";
  const agentKey = "5ee8b71aaf6a0a7fa57e32b8d3084ae00f4ffeda3833f15823c763b4d8b88899";
  
  const provider = new hre.ethers.JsonRpcProvider("https://rpc.testnet.arc.network");
  const agentWallet = new hre.ethers.Wallet(agentKey, provider);
  console.log("Agent wallet:", agentWallet.address);
  
  const balance = await provider.getBalance(agentWallet.address);
  console.log("Agent balance:", hre.ethers.formatEther(balance), "USDC (gas)");

  const signalBus = await hre.ethers.getContractAt("DrachmaSignalBus", signalBusAddr, agentWallet);
  
  console.log("Subscribing vault to SignalBus...");
  const tx = await signalBus.subscribe(vaultAddr);
  await tx.wait();
  console.log("Subscribed! tx:", tx.hash);
}

main().catch(e => { console.error(e); process.exitCode = 1; });
