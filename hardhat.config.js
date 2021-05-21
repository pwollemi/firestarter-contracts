/**
 * @type import('hardhat/config').HardhatUserConfig
 */

const { resolve } = require('path');
require('@nomiclabs/hardhat-waffle');

const { mnemonic } = require('./secrets.json');

module.exports = {
  solidity: '0.7.6',
  networks: {
    testnet: {
      url: 'https://data-seed-prebsc-1-s1.binance.org:8545',
      chainId: 97,
      gasPrice: 20000000000,
      accounts: { mnemonic: mnemonic },
    },
    mainnet: {
      url: 'https://bsc-dataseed.binance.org/',
      chainId: 56,
      gasPrice: 20000000000,
      accounts: { mnemonic: mnemonic },
    },
  },
};
