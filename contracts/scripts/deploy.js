const hre = require("hardhat");

async function main() {
  const agentWallet = process.env.AGENT_WALLET_ADDRESS;
  if (!agentWallet) throw new Error("Set AGENT_WALLET_ADDRESS in .env");

  console.log("Deploying Drachma Protocol v2...\n");

  // 1. Deploy DrachmaSignalBus
  const SignalBus = await hre.ethers.getContractFactory("DrachmaSignalBus");
  const signalBus = await SignalBus.deploy();
  await signalBus.waitForDeployment();
  const signalBusAddr = await signalBus.getAddress();
  console.log("DrachmaSignalBus:", signalBusAddr);

  // 2. Deploy DrachmaScoreOracle
  const ScoreOracle = await hre.ethers.getContractFactory("DrachmaScoreOracle");
  const scoreOracle = await ScoreOracle.deploy();
  await scoreOracle.waitForDeployment();
  const scoreOracleAddr = await scoreOracle.getAddress();
  console.log("DrachmaScoreOracle:", scoreOracleAddr);

  // 3. Deploy DrachmaFactory
  const Factory = await hre.ethers.getContractFactory("DrachmaFactory");
  const factory = await Factory.deploy(signalBusAddr, scoreOracleAddr);
  await factory.waitForDeployment();
  const factoryAddr = await factory.getAddress();
  console.log("DrachmaFactory:", factoryAddr);

  // 4. Wire factory permissions
  await signalBus.setFactory(factoryAddr);
  console.log("SignalBus.setFactory done");
  await scoreOracle.setFactory(factoryAddr);
  console.log("ScoreOracle.setFactory done");

  // 5. Create first vault via Factory
  const tx = await factory.createVault(
    agentWallet,
    2000, 6000,  // USDC bands
    1000, 4000,  // EURC bands
    2000, 6000   // USYC bands
  );
  await tx.wait();
  const vaultAddr = await factory.allVaults(0);
  console.log("DrachmaVault v2:", vaultAddr);

  console.log("\n--- Deployment Complete ---");
  console.log("SIGNAL_BUS_ADDRESS=" + signalBusAddr);
  console.log("SCORE_ORACLE_ADDRESS=" + scoreOracleAddr);
  console.log("FACTORY_ADDRESS=" + factoryAddr);
  console.log("VAULT_ADDRESS=" + vaultAddr);

  console.log("\nVerify contracts:");
  console.log(`npx hardhat verify --network arc_testnet ${signalBusAddr}`);
  console.log(`npx hardhat verify --network arc_testnet ${scoreOracleAddr}`);
  console.log(`npx hardhat verify --network arc_testnet ${factoryAddr} "${signalBusAddr}" "${scoreOracleAddr}"`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
