const hre = require("hardhat");

async function main() {
  const agentWallet = process.env.AGENT_WALLET_ADDRESS;
  if (!agentWallet) throw new Error("Set AGENT_WALLET_ADDRESS in .env");

  console.log("Deploying DrachmaVault...");
  console.log("Agent wallet:", agentWallet);

  const DrachmaVault = await hre.ethers.getContractFactory("DrachmaVault");
  const vault = await DrachmaVault.deploy(agentWallet);
  await vault.waitForDeployment();

  const address = await vault.getAddress();
  console.log("DrachmaVault deployed to:", address);
  console.log("\nVerify with:");
  console.log(`npx hardhat verify --network arc_testnet ${address} ${agentWallet}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
