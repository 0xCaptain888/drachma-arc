const hre = require("hardhat");

async function main() {
  const agentWallet = "0xc7e424c1e4b346c06a35241e7bca469477483683";
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Balance:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)));

  console.log("\n=== Deploying Drachma Protocol v2 (with full mock stack) ===\n");

  // 1. Deploy MockUSDC
  const MockERC20 = await hre.ethers.getContractFactory("MockERC20");
  const mockUsdc = await MockERC20.deploy("USD Coin", "USDC");
  await mockUsdc.waitForDeployment();
  const usdcAddr = await mockUsdc.getAddress();
  console.log("MockUSDC:", usdcAddr);

  // 2. Deploy MockEURC
  const eurc = await MockERC20.deploy("Euro Coin", "EURC");
  await eurc.waitForDeployment();
  const eurcAddr = await eurc.getAddress();
  console.log("MockEURC:", eurcAddr);

  // 3. Deploy MockUSYC (uses our MockUSDC)
  const MockUSYC = await hre.ethers.getContractFactory("MockUSYC");
  const usyc = await MockUSYC.deploy(usdcAddr);
  await usyc.waitForDeployment();
  const usycAddr = await usyc.getAddress();
  console.log("MockUSYC:", usycAddr);

  // 4. Deploy MockStableFX
  const MockStableFX = await hre.ethers.getContractFactory("MockStableFX");
  const stableFx = await MockStableFX.deploy();
  await stableFx.waitForDeployment();
  const stableFxAddr = await stableFx.getAddress();
  console.log("MockStableFX:", stableFxAddr);

  // 5. Deploy DrachmaSignalBus
  const SignalBus = await hre.ethers.getContractFactory("DrachmaSignalBus");
  const signalBus = await SignalBus.deploy();
  await signalBus.waitForDeployment();
  const signalBusAddr = await signalBus.getAddress();
  console.log("DrachmaSignalBus:", signalBusAddr);

  // 6. Deploy DrachmaScoreOracle
  const ScoreOracle = await hre.ethers.getContractFactory("DrachmaScoreOracle");
  const scoreOracle = await ScoreOracle.deploy();
  await scoreOracle.waitForDeployment();
  const scoreOracleAddr = await scoreOracle.getAddress();
  console.log("DrachmaScoreOracle:", scoreOracleAddr);

  // 7. Deploy DrachmaFactory
  const Factory = await hre.ethers.getContractFactory("DrachmaFactory");
  const factory = await Factory.deploy(
    signalBusAddr, scoreOracleAddr,
    usdcAddr, eurcAddr, usycAddr, stableFxAddr
  );
  await factory.waitForDeployment();
  const factoryAddr = await factory.getAddress();
  console.log("DrachmaFactory:", factoryAddr);

  // 8. Wire permissions
  await (await signalBus.setFactory(factoryAddr)).wait();
  await (await scoreOracle.setFactory(factoryAddr)).wait();
  console.log("Permissions wired");

  // 9. Create vault
  const createTx = await factory.createVault(agentWallet, 2000, 6000, 1000, 4000, 2000, 6000);
  await createTx.wait();
  const vaultAddr = await factory.allVaults(0);
  console.log("DrachmaVault:", vaultAddr);

  // 10. Mint tokens to participants
  console.log("\nMinting tokens...");
  await (await mockUsdc.mint(deployer.address, 100000_000000n)).wait();
  await (await mockUsdc.mint(agentWallet, 50000_000000n)).wait();
  await (await eurc.mint(deployer.address, 50000_000000n)).wait();
  await (await eurc.mint(agentWallet, 50000_000000n)).wait();
  
  // Fund StableFX with both tokens for swaps
  await (await mockUsdc.mint(stableFxAddr, 500000_000000n)).wait();
  await (await eurc.mint(stableFxAddr, 500000_000000n)).wait();
  
  // Fund USYC with USDC backing
  await (await mockUsdc.mint(usycAddr, 500000_000000n)).wait();
  
  console.log("All tokens minted");

  console.log("\n=== DEPLOYMENT COMPLETE ===\n");
  console.log("USDC_ADDRESS=" + usdcAddr);
  console.log("EURC_ADDRESS=" + eurcAddr);
  console.log("USYC_ADDRESS=" + usycAddr);
  console.log("STABLE_FX_ADDRESS=" + stableFxAddr);
  console.log("SIGNAL_BUS_ADDRESS=" + signalBusAddr);
  console.log("SCORE_ORACLE_ADDRESS=" + scoreOracleAddr);
  console.log("FACTORY_ADDRESS=" + factoryAddr);
  console.log("VAULT_ADDRESS=" + vaultAddr);
  console.log("\nExplorer: https://testnet.arcscan.app/address/" + vaultAddr);
}

main().catch(e => { console.error(e); process.exitCode = 1; });
