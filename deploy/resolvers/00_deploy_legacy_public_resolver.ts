import { execute, artifacts } from '@rocketh'

export default execute(
  async ({ deploy, get, namedAccounts, network }) => {
    const { deployer } = namedAccounts

    if (!network.tags?.legacy) {
      return
    }

    const registry = await get('ENSRegistry')
    const nameWrapper = await get('NameWrapper')
    const ethRegistrarController = await get('ETHRegistrarController')
    const reverseRegistrar = await get('ReverseRegistrar')

    // Use the regular PublicResolver artifact for legacy deployment
    await deploy('LegacyPublicResolver', {
      account: deployer,
      artifact: artifacts.PublicResolver,
      args: [
        registry.address,
        nameWrapper.address,
        ethRegistrarController.address,
        reverseRegistrar.address,
      ],
    })
  },
  {
    id: 'PublicResolver v1.0.0',
    tags: ['category:resolvers', 'LegacyPublicResolver'],
    dependencies: [
      'ENSRegistry',
      'NameWrapper',
      'ETHRegistrarController',
      'ReverseRegistrar',
    ],
  },
)
