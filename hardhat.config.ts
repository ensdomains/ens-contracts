import { configVariable, task, type HardhatUserConfig } from 'hardhat/config'
import type { HardhatPlugin } from 'hardhat/types/plugins'

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

// The upstream NameWrapper / ETHRegistrarController / BulkRenewal / MigrationHelper
// subsystem is kept in the tree for parity with `simplex`, but the wrapper-free
// redesign no longer uses it and it no longer compiles against the new
// BaseRegistrar API. Feed solc an empty stub for those sources so the build
// ignores their bodies (the real source stays on disk; they are also excluded
// from vitest and tsconfig, and their deploy scripts were dropped).
const deadCodeSources = [
  'contracts/ethregistrar/BulkRenewal.sol',
  'contracts/ethregistrar/ETHRegistrarController.sol',
  'contracts/ethregistrar/IBulkRenewal.sol',
  'contracts/ethregistrar/StaticBulkRenewal.sol',
  'contracts/utils/MigrationHelper.sol',
  'contracts/wrapper/Controllable.sol',
  'contracts/wrapper/ERC1155Fuse.sol',
  'contracts/wrapper/NameWrapper.sol',
  'contracts/wrapper/StaticMetadataService.sol',
  'contracts/wrapper/mocks/ERC1155ReceiverMock.sol',
  'contracts/wrapper/mocks/TestUnwrap.sol',
  'contracts/wrapper/mocks/UpgradedNameWrapperMock.sol',
  'contracts/wrapper/test/NameGriefer.sol',
  'contracts/wrapper/test/TestNameWrapperReentrancy.sol',
]
const deadCodeStub = '// SPDX-License-Identifier: MIT\npragma solidity >=0.8.4;\n'

const excludeDeadCodeFromBuild: HardhatPlugin = {
  id: 'snrc-exclude-dead-code',
  hookHandlers: {
    solidity: async () => ({
      default: async () => ({
        async readSourceFile(context, absolutePath, next) {
          if (deadCodeSources.some((source) => absolutePath.endsWith(source)))
            return deadCodeStub
          return next(context, absolutePath)
        },
      }),
    }),
  },
}

const config = {
  networks: {
    hardhat: {
      type: 'edr-simulated',
      allowUnlimitedContractSize: false,
      chainId: 1337,
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
  generateTypedArtifacts: {
    destinations: {
      js: ['./generated/artifacts.js'],
      ts: ['./generated/artifacts.ts'],
    },
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
    excludeDeadCodeFromBuild,
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
