const hre = require("hardhat");
async function main() {
  const deployer = "0x2F9fDE6B6FB8d7353aB80F082f85F0d70B809C3b";
  const agent = "0xC7e424c1E4B346c06A35241e7BCa469477483683";
  const dBal = await hre.ethers.provider.getBalance(deployer);
  const aBal = await hre.ethers.provider.getBalance(agent);
  console.log("Deployer native:", hre.ethers.formatEther(dBal), "USDC");
  console.log("Agent native:", hre.ethers.formatEther(aBal), "USDC");
}
main().catch(e => { console.error(e); process.exit(1); });
