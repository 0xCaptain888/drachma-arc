require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();
const { subtask } = require("hardhat/config");
const { TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS } = require("hardhat/builtin-tasks/task-names");

// Exclude node_modules/.sol files that eth-gas-reporter places under mock/contracts
subtask(TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS, async (_, __, runSuper) => {
  const paths = await runSuper();
  return paths.filter(p => !p.includes("node_modules"));
});

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "cancun",
      viaIR: true
    }
  },
  paths: {
    sources: "./",
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
