const { utils } = require('ethers')
const fs = require('fs')
const { execSync } = require('child_process');

require('@nomiclabs/hardhat-waffle')
require('hardhat-gas-reporter')

const commit = execSync('git rev-parse --short HEAD', ).toString().trim();

module.exports = {
  solidity: {
    version: '0.8.4',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    localhost: {
      url: 'http://localhost:8545',
    },
  },
  gasReporter: {
    excludeContracts: ['mocks', 'registry', 'ethregistrar'],
    outputFile: `gasreport-${commit}.txt`,
    noColors: true,
  }
}
