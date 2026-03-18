import { deployScript } from '@rocketh'
import { Artifact_UniversalResolver } from 'generated/artifacts/UniversalResolver.js'
import type { Abi_ENSRegistry } from 'generated/abis/ENSRegistry.js'
import type { Abi_GatewayProvider } from 'generated/abis/GatewayProvider.js'

export default deployScript(
  async ({ deploy, get, namedAccounts }) => {
    const { deployer, owner } = namedAccounts

    const registry = get<Abi_ENSRegistry>('ENSRegistry')
    const batchGatewayProvider = get<Abi_GatewayProvider>(
      'BatchGatewayProvider',
    )

    await deploy('UniversalResolver', {
      account: deployer,
      artifact: Artifact_UniversalResolver,
      args: [owner, registry.address, batchGatewayProvider.address],
    })

    return true
  },
  {
    id: 'UniversalResolver v1.0.1',
    tags: ['category:utils', 'UniversalResolver'],
    dependencies: ['ENSRegistry', 'BatchGatewayProvider'],
  },
)
