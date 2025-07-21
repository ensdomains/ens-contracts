import { execute, artifacts } from '@rocketh'

export default execute(
  async ({ deploy, get, namedAccounts, network, deployments }) => {
    const { deployer } = namedAccounts

    if (!network.tags.legacy) {
      return
    }

    const registry = await get('ENSRegistry')

    await deploy('LegacyPublicResolver', {
      account: deployer,
      artifact: await (deployments as any).getArtifact(
        'PublicResolver_mainnet_9412610',
      ),
      args: [registry.address],
    })
  },
  {
    id: 'PublicResolver v1.0.0',
    tags: ['category:resolvers', 'LegacyPublicResolver'],
    dependencies: ['ENSRegistry'],
  },
)
