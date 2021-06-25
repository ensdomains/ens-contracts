const { utils } = require('ethers')
const fs = require('fs')
const { execSync } = require('child_process');
require('@nomiclabs/hardhat-waffle')
require('hardhat-gas-reporter')
require("@nomiclabs/hardhat-etherscan");
const envfile = require('envfile')
const { PRIVATE_KEY, ETHERSCAN_API_KEY, INFURA_API_KEY } = envfile.parse(fs.readFileSync('./.env'));

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
    rinkeby: {
      url: `https://rinkeby.infura.io/v3/${INFURA_API_KEY}`,
      accounts: [PRIVATE_KEY]
    }
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY
  },
  gasReporter: {
    excludeContracts: ['mocks', 'registry', 'ethregistrar'],
    outputFile: `gasreport-${commit}.txt`,
    noColors: true,
  }
}
