/**
 * @type import('hardhat/config').HardhatUserConfig
 */

require('@nomiclabs/hardhat-waffle');

const { mnemonic } = require('./secrets.json');

module.exports = {
  solidity: {
    version: "0.8.0",
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
      gasPrice: 20000000000,
      accounts: { mnemonic: mnemonic },
    },
    testnet: {
      url: 'https://data-seed-prebsc-1-s1.binance.org:8545',
      chainId: 97,
      gasPrice: 20000000000,
      accounts: { mnemonic: mnemonic },
    },
    matic: {
      url: 'https://rpc-mainnet.matic.network',
      chainId: 137,
      gasPrice: 20000000000,
      accounts: {mnemonic: mnemonic},
    },
    mainnet: {
      url: 'https://bsc-dataseed.binance.org/',
      chainId: 56,
      gasPrice: 20000000000,
      accounts: { mnemonic: mnemonic },
    },
    hardhat: {
      forking: {
        url:
          "https://data-seed-prebsc-1-s1.binance.org:8545",
      },
      accounts: {
        mnemonic: mnemonic,
        accountsBalance: "10000000000000000000000",
      },
      chainId: 1337,
    },
  },
};
