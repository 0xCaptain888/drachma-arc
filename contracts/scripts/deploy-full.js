const hre = require("hardhat");

async function main() {
  const agentWallet = "0xc7e424c1e4b346c06a35241e7bca469477483683";
  const NATIVE_USDC = "0x3600000000000000000000000000000000000000";
  
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Balance:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)));

  console.log("\n=== Deploying Drachma Protocol v2 (Full) ===\n");

  // 1. Deploy MockERC20 for EURC
  console.log("1. Deploying MockEURC...");
  const MockERC20 = await hre.ethers.getContractFactory("MockERC20");
  const eurc = await MockERC20.deploy("Euro Coin", "EURC");
  await eurc.waitForDeployment();
  const eurcAddr = await eurc.getAddress();
  console.log("   EURC:", eurcAddr);

  // 2. Deploy MockUSYC
  console.log("2. Deploying MockUSYC...");
  const MockUSYC = await hre.ethers.getContractFactory("MockUSYC");
  const usyc = await MockUSYC.deploy(NATIVE_USDC);
  await usyc.waitForDeployment();
  const usycAddr = await usyc.getAddress();
  console.log("   USYC:", usycAddr);

  // 3. Deploy MockStableFX
  console.log("3. Deploying MockStableFX...");
  const MockStableFX = await hre.ethers.getContractFactory("MockStableFX");
  const stableFx = await MockStableFX.deploy();
  await stableFx.waitForDeployment();
  const stableFxAddr = await stableFx.getAddress();
  console.log("   StableFX:", stableFxAddr);

  // 4. Deploy DrachmaSignalBus
  console.log("4. Deploying DrachmaSignalBus...");
  const SignalBus = await hre.ethers.getContractFactory("DrachmaSignalBus");
  const signalBus = await SignalBus.deploy();
  await signalBus.waitForDeployment();
  const signalBusAddr = await signalBus.getAddress();
  console.log("   SignalBus:", signalBusAddr);

  // 5. Deploy DrachmaScoreOracle
  console.log("5. Deploying DrachmaScoreOracle...");
  const ScoreOracle = await hre.ethers.getContractFactory("DrachmaScoreOracle");
  const scoreOracle = await ScoreOracle.deploy();
  await scoreOracle.waitForDeployment();
  const scoreOracleAddr = await scoreOracle.getAddress();
  console.log("   ScoreOracle:", scoreOracleAddr);

  // 6. Deploy DrachmaFactory
  console.log("6. Deploying DrachmaFactory...");
  const Factory = await hre.ethers.getContractFactory("DrachmaFactory");
  const factory = await Factory.deploy(
    signalBusAddr, scoreOracleAddr,
    NATIVE_USDC, eurcAddr, usycAddr, stableFxAddr
  );
  await factory.waitForDeployment();
  const factoryAddr = await factory.getAddress();
  console.log("   Factory:", factoryAddr);

  // 7. Wire permissions
  console.log("7. Wiring permissions...");
  await (await signalBus.setFactory(factoryAddr)).wait();
  await (await scoreOracle.setFactory(factoryAddr)).wait();
  console.log("   Factory permissions set");

  // 8. Create vault via Factory
  console.log("8. Creating DrachmaVault...");
  const tx = await factory.createVault(
    agentWallet,
    2000, 6000,  // USDC 20-60%
    1000, 4000,  // EURC 10-40%
    2000, 6000   // USYC 20-60%
  );
  await tx.wait();
  const vaultAddr = await factory.allVaults(0);
  console.log("   Vault:", vaultAddr);

  // 9. Fund MockStableFX with EURC for swaps
  console.log("9. Funding StableFX with EURC...");
  await (await eurc.mint(stableFxAddr, 100000_000000n)).wait(); // 100K EURC
  console.log("   StableFX funded with 100K EURC");

  // 10. Fund MockStableFX with USDC for reverse swaps
  // (need to send native USDC to StableFX - can't mint native USDC)
  // For now, skip USDC funding of StableFX

  // 11. Mint EURC to deployer & agent for testing
  console.log("10. Minting EURC to wallets...");
  await (await eurc.mint(deployer.address, 10000_000000n)).wait();
  await (await eurc.mint(agentWallet, 10000_000000n)).wait();
  console.log("    Minted 10K EURC each");

  console.log("\n=== DEPLOYMENT COMPLETE ===\n");
  console.log("--- Contract Addresses ---");
  console.log(`EURC_ADDRESS=${eurcAddr}`);
  console.log(`USYC_ADDRESS=${usycAddr}`);
  console.log(`STABLE_FX_ADDRESS=${stableFxAddr}`);
  console.log(`SIGNAL_BUS_ADDRESS=${signalBusAddr}`);
  console.log(`SCORE_ORACLE_ADDRESS=${scoreOracleAddr}`);
  console.log(`FACTORY_ADDRESS=${factoryAddr}`);
  console.log(`VAULT_ADDRESS=${vaultAddr}`);
  console.log(`\n--- Explorer Links ---`);
  console.log(`Vault: https://testnet.arcscan.app/address/${vaultAddr}`);
  console.log(`SignalBus: https://testnet.arcscan.app/address/${signalBusAddr}`);
  console.log(`ScoreOracle: https://testnet.arcscan.app/address/${scoreOracleAddr}`);
  console.log(`Factory: https://testnet.arcscan.app/address/${factoryAddr}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
