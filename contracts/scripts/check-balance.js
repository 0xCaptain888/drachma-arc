const hre = require("hardhat");
async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance:", hre.ethers.formatUnits(balance, 6), "USDC (native)");
  const block = await hre.ethers.provider.getBlockNumber();
  console.log("Current block:", block);
}
main().catch(e => { console.error(e); process.exit(1); });
