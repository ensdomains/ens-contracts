import { deployScript } from '@rocketh'
import type { Abi_ENSRegistry } from 'generated/abis/ENSRegistry.js'
import type { Artifact } from 'rocketh/types'
import LegacyPublicResolverArtifact from '../../deployments/archive/PublicResolver_mainnet_9412610.sol/PublicResolver_mainnet_9412610.json'

export default deployScript(
  async ({ deploy, get, namedAccounts, tags }) => {
    const { deployer } = namedAccounts

    if (!tags?.legacy) {
      return
    }

    const registry = get<Abi_ENSRegistry>('ENSRegistry')

    await deploy('LegacyPublicResolver', {
      account: deployer,
      artifact: LegacyPublicResolverArtifact as unknown as Artifact,
      args: [registry.address],
    })

    return true;
  },
  {
    id: 'PublicResolver v1.0.0',
    tags: ['category:resolvers', 'LegacyPublicResolver'],
    dependencies: ['ENSRegistry'],
  },
)
