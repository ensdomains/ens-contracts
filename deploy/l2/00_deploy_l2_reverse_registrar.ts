import { evmChainIdToCoinType } from '@ensdomains/address-encoder/utils'
import { execute, artifacts } from '@rocketh'
import { namehash } from 'viem'

// SafeL2 contract address (deterministic across all EVM chains)
export const safeConfig = {
  testnet: {
    expectedDeploymentAddress:
      '0x41675C099F32341bf84BFc5382aF534df5C7461a' as `0x${string}`,
  },
  mainnet: {
    expectedDeploymentAddress:
      '0x41675C099F32341bf84BFc5382aF534df5C7461a' as `0x${string}`,
  },
}

export default execute(
  async ({ deploy, namedAccounts, network }) => {
    const { deployer } = namedAccounts
    const chainId = network.chain.id
    const coinType = evmChainIdToCoinType(chainId) as bigint
    const coinTypeHex = coinType.toString(16)

    const REVERSE_NAMESPACE = `${coinTypeHex}.reverse`
    const REVERSENODE = namehash(REVERSE_NAMESPACE)

    // Determine if this is a Base chain that needs migration support
    const isBaseChain = chainId === 8453 || chainId === 84532 // Base mainnet or Base Sepolia

    if (isBaseChain) {
      // For Base chains, we need the migration version
      const safeAddress = network.tags.testnet
        ? '0x343431e9CEb7C19cC8d3eA0EE231bfF82B584910'
        : '0x353530FE74098903728Ddb66Ecdb70f52e568eC1'

      const oldReverseResolver =
        chainId === 8453
          ? '0xC6d566A56A1aFf6508b41f6c90ff131615583BCD' // Base mainnet
          : '0x6533C94869D28fAA8dF77cc63f9e2b2D6Cf77eBA' // Base Sepolia

      await deploy('L2ReverseRegistrar', {
        account: deployer,
        artifact: artifacts.L2ReverseRegistrarWithMigration,
        args: [coinType, safeAddress, REVERSENODE, oldReverseResolver],
      })
    } else {
      // For other L2 chains, use the standard version
      await deploy('L2ReverseRegistrar', {
        account: deployer,
        artifact: artifacts.L2ReverseRegistrar,
        args: [coinType],
      })
    }
  },
  {
    id: 'L2ReverseRegistrar v1.0.0',
    tags: ['category:l2', 'L2ReverseRegistrar'],
    dependencies: ['UniversalSigValidator'],
  },
)
