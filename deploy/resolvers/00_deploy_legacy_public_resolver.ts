import { artifacts, execute } from '@rocketh'
import type { Artifact } from 'rocketh'
import LegacyPublicResolverArtifact from '../../deployments/archive/PublicResolver_mainnet_9412610.sol/PublicResolver_mainnet_9412610.json'

export default execute(
  async ({ deploy, get, namedAccounts, network }) => {
    const { deployer } = namedAccounts

    if (!network.tags?.legacy) {
      return
    }

    const registry = get<(typeof artifacts.ENSRegistry)['abi']>('ENSRegistry')

    await deploy('LegacyPublicResolver', {
      account: deployer,
      artifact: LegacyPublicResolverArtifact as unknown as Artifact,
      args: [registry.address],
    })
  },
  {
    id: 'PublicResolver v1.0.0',
    tags: ['category:resolvers', 'LegacyPublicResolver'],
    dependencies: ['ENSRegistry'],
  },
)
