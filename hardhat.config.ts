import { HardhatUserConfig } from "hardhat/types";
import "@nomiclabs/hardhat-waffle";
import "@nomiclabs/hardhat-etherscan";
import "@openzeppelin/hardhat-upgrades";
import "hardhat-typechain";
import "hardhat-deploy";
import "hardhat-contract-sizer";
import "solidity-coverage";
import { config as dotEnvConfig } from "dotenv";

dotEnvConfig();

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";
const mnemonic = process.env.WORKER_SEED || "";

const defaultConfig = {
  accounts: { mnemonic },
}

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.4",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  defaultNetwork: "hardhat",
  networks: {
    localnetwork: {
      url: "http://127.0.0.1:8545",
      chainId: 1337,
      ...defaultConfig
    },
    testnet: {
      url: 'https://data-seed-prebsc-1-s1.binance.org:8545',
      chainId: 97,
      ...defaultConfig
    },
    matic: {
      url: 'https://polygon-rpc.com',
      chainId: 137,
      ...defaultConfig
    },
    mumbai: {
      url: 'https://rpc-mumbai.maticvigil.com/v1/6f270be03821c413f67b6a21826d4048ce33114c',
      chainId: 80001,
      ...defaultConfig
    },
    mainnet: {
      url: 'https://bsc-dataseed.binance.org/',
      chainId: 56,
      ...defaultConfig
    },
    rinkeby: {
      url: 'https://eth-rinkeby.alchemyapi.io/v2/REZr-zgRgl0qN85El98QSsiVdEkMRenL',
      chainId: 4,
      ...defaultConfig
    },
    hardhat: {
      forking: {
        url:
          "https://data-seed-prebsc-1-s1.binance.org:8545",
      },
      accounts: {
        mnemonic,
        accountsBalance: "10000000000000000000000",
      },
      chainId: 1337,
    },
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY,
  },
  mocha: {
    timeout: "1000000s"
  },
  contractSizer: {
    alphaSort: true,
    runOnCompile: true,
    disambiguatePaths: false,
  }
};

export default config;
