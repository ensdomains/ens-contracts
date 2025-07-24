import dotenv from 'dotenv'
import { HardhatUserConfig } from 'hardhat/config'
import hardhatViem from '@nomicfoundation/hardhat-viem'

// Load environment variables from .env file. Suppress warnings using silent
// if this file is missing. dotenv will never modify any environment variables
// that have already been set.
// https://github.com/motdotla/dotenv
dotenv.config({ debug: false })

let real_accounts: string[] | undefined = undefined
if (process.env.DEPLOYER_KEY) {
  real_accounts = [
    process.env.DEPLOYER_KEY,
    process.env.OWNER_KEY || process.env.DEPLOYER_KEY,
  ]
}

// circular dependency shared with actions
export const archivedDeploymentPath = './deployments/archive'

const config: HardhatUserConfig = {
  paths: {
    sources: './contracts',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts',
  },
  networks: {
    hardhat: {
      type: 'edr',
      forking: process.env.FORKING_ENABLED
        ? {
            url: `https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
          }
        : undefined,
    },
    localhost: {
      type: 'http',
      url: 'http://127.0.0.1:8545/',
    },
    sepolia: {
      type: 'http',
      url: `https://sepolia.infura.io/v3/${process.env.INFURA_API_KEY}`,
      chainId: 11155111,
      accounts: real_accounts,
    },
    holesky: {
      type: 'http',
      url: `https://holesky.gateway.tenderly.co`,
      chainId: 17000,
      accounts: real_accounts,
    },
    mainnet: {
      type: 'http',
      url: `https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
      chainId: 1,
      accounts: real_accounts,
    },
  },
  solidity: {
    compilers: [
      {
        version: '0.8.28',
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      // for DummyOldResolver contract
      {
        version: '0.4.11',
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
  plugins: [hardhatViem],
}

export default config
