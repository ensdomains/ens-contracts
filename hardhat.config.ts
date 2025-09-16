import { configVariable, task, type HardhatUserConfig } from 'hardhat/config'

import dotenv from 'dotenv'

import HardhatChaiMatchersViemPlugin from '@ensdomains/hardhat-chai-matchers-viem'
import HardhatKeystore from '@nomicfoundation/hardhat-keystore'
import HardhatNetworkHelpersPlugin from '@nomicfoundation/hardhat-network-helpers'
import HardhatViem from '@nomicfoundation/hardhat-viem'
import HardhatDeploy from 'hardhat-deploy'

const realAccounts = [
  configVariable('DEPLOYER_KEY'),
  configVariable('OWNER_KEY'),
]

import { arbitrum, optimism } from 'viem/chains'

dotenv.config({ debug: false })

// circular dependency shared with actions
export const archivedDeploymentPath = './deployments/archive'

const config = {
  networks: {
    hardhat: {
      type: 'edr-simulated',
      allowUnlimitedContractSize: false,
    },
    mainnetFork: {
      type: 'edr-simulated',
      allowUnlimitedContractSize: false,
      chainId: 1,
      forking: {
        enabled: true,
        url: `https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
      },
    },
    localhost: {
      type: 'http',
      chainId: 31337,
      url: 'http://127.0.0.1:8545/',
    },
    sepolia: {
      type: 'http',
      url: `https://sepolia.infura.io/v3/${process.env.INFURA_API_KEY}`,
      chainId: 11155111,
      accounts: realAccounts,
    },
    holesky: {
      type: 'http',
      url: `https://holesky.gateway.tenderly.co`,
      chainId: 17000,
      accounts: realAccounts,
    },
    mainnet: {
      type: 'http',
      url: `https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
      chainId: 1,
      accounts: realAccounts,
    },
    optimism: {
      type: 'http',
      url: optimism.rpcUrls.default.http[0],
      chainId: optimism.id,
      accounts: realAccounts,
    },
    arbitrum: {
      type: 'http',
      url: arbitrum.rpcUrls.default.http[0],
      chainId: arbitrum.id,
      accounts: realAccounts,
    },
  },
  solidity: {
    compilers: [
      {
        version: '0.8.26',
        settings: {
          optimizer: {
            enabled: true,
            runs: 1_000_000,
          },
          metadata: {
            bytecodeHash: 'ipfs',
            useLiteralContent: true,
          },
          evmVersion: 'paris',
        },
      },
      {
        version: '0.8.17',
        settings: {
          optimizer: {
            enabled: true,
            runs: 1200,
          },
        },
      },
    ],
    overrides: {
      'contracts/wrapper/NameWrapper.sol': {
        version: '0.8.17',
        settings: {
          optimizer: {
            enabled: true,
            runs: 1200,
          },
        },
      },
    },
    npmFilesToBuild: [
      '@openzeppelin/contracts/utils/introspection/ERC165.sol',
      '@openzeppelin/contracts/utils/introspection/IERC165.sol',
      '@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol',
      '@openzeppelin/contracts/token/ERC1155/IERC1155.sol',
    ],
  },
  paths: {
    sources: {
      solidity: ['./contracts'],
    },
  },
  plugins: [
    HardhatNetworkHelpersPlugin,
    HardhatChaiMatchersViemPlugin,
    HardhatViem,
    HardhatDeploy,
    HardhatKeystore,
  ],
  tasks: [
    task('accounts', 'Prints the list of accounts')
      .setAction(() => import('./tasks/accounts.js'))
      .build(),
    task('archive-scan', 'Scans the deployments for unarchived deployments')
      .setAction(() => import('./tasks/archive_scan.js'))
      .build(),
    task('create-l2-safe', 'Creates an L2 Safe')
      .setAction(() => import('./tasks/create_l2_safe.js'))
      .build(),
    task('multichain-verify', 'Verify contracts using etherscan v2 api')
      .addPositionalArgument({
        name: 'contractName',
        description: 'The contract name to verify',
      })
      .addPositionalArgument({
        name: 'address',
        description: 'The contract address to verify',
      })
      .addVariadicArgument({
        name: 'deployArgs',
        description: 'Constructor arguments',
      })
      .setAction(() => import('./tasks/etherscan-multichain.js'))
      .build(),
    task('save', 'Saves a specified contract as a deployed contract')
      .addPositionalArgument({
        name: 'contract',
        description: 'The contract to save',
      })
      .addPositionalArgument({
        name: 'block',
        description: 'The block number the contract was deployed at',
      })
      .addPositionalArgument({
        name: 'fullName',
        description:
          '(Optional) The fully qualified name of the contract (e.g. contracts/resolvers/PublicResolver.sol:PublicResolver)',
      })
      .setAction(() => import('./tasks/save.js'))
      .build(),
    task('seed', 'Creates test subbdomains and wraps them with Namewrapper')
      .addPositionalArgument({
        name: 'name',
        description: 'The ENS label to seed subdomains',
      })
      .setAction(() => import('./tasks/seed.js'))
      .build(),
  ],
} satisfies HardhatUserConfig

// safe's pkgs set addressType to string for some reason
declare module 'abitype' {
  interface Register {
    addressType: `0x${string}`
  }
}

export default config
