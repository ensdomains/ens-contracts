const { utils } = require('ethers')
const fs = require('fs')

require('@nomiclabs/hardhat-waffle')

const { isAddress, getAddress, formatUnits, parseUnits } = utils

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
}
