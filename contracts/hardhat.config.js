require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "cancun"
    }
  },
  paths: {
    sources: ".",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  },
  networks: {
    arc_testnet: {
      url: process.env.ARC_RPC_URL || "https://rpc-testnet.arcprotocol.xyz",
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
      chainId: 480808
    },
    arc_mainnet: {
      url: process.env.ARC_MAINNET_RPC || "https://rpc.arcprotocol.xyz",
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
    }
  }
};
