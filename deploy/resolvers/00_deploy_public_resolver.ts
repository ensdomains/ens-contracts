import { execute, artifacts } from '@rocketh'
import { getAddress, namehash, encodeFunctionData } from 'viem'

export default execute(
  async ({ deploy, get, namedAccounts, tx, network }) => {
    const { deployer, owner } = namedAccounts

    // Get dependencies
    const registry = await get('ENSRegistry')
    const nameWrapper = await get('NameWrapper')
    const controller = await get('ETHRegistrarController')
    const reverseRegistrar = await get('ReverseRegistrar')

    // Deploy PublicResolver
    const publicResolverDeployment = await deploy('PublicResolver', {
      account: deployer,
      artifact: artifacts.PublicResolver,
      args: [
        registry.address,
        nameWrapper.address,
        controller.address,
        reverseRegistrar.address,
      ],
    })

    if (!publicResolverDeployment.newlyDeployed) return

    const publicResolver = await get('PublicResolver')

    // Only attempt to make changes directly on testnets
    if (network.name === 'mainnet' && !network.tags?.tenderly) return

    // Set PublicResolver as default resolver on ReverseRegistrar
    try {
      await tx({
        to: reverseRegistrar.address,
        data: encodeFunctionData({
          abi: reverseRegistrar.abi,
          functionName: 'setDefaultResolver',
          args: [publicResolver.address],
        }),
        account: owner,
      })
      console.log(`Set PublicResolver as default resolver on ReverseRegistrar`)
    } catch (error) {
      console.log('PublicResolver default resolver setup error:', error.message)
    }
  },
  {
    id: 'PublicResolver v3.0.0',
    tags: ['category:resolvers', 'PublicResolver'],
    dependencies: [
      'ENSRegistry',
      'NameWrapper',
      'ETHRegistrarController',
      'ReverseRegistrar',
    ],
  },
)
