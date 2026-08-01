import { deployScript } from '@rocketh'
import type { Abi_ENSRegistry } from 'generated/abis/ENSRegistry.js'
import { Artifact_BaseRegistrarImplementation } from 'generated/artifacts/BaseRegistrarImplementation.js'
import { namehash } from 'viem/ens'

export default deployScript(
  async ({ deploy, get, namedAccounts, tags }) => {
    const { deployer } = namedAccounts

    if (!tags?.use_root) {
      return
    }

    const registry = get<Abi_ENSRegistry>('ENSRegistry')

    await deploy('BaseRegistrarImplementation', {
      account: deployer,
      artifact: Artifact_BaseRegistrarImplementation,
      args: [registry.address, namehash('eth')],
    })

    return true;
  },
  {
    id: 'BaseRegistrarImplementation:contract v1.0.0',
    tags: [
      'category:ethregistrar',
      'BaseRegistrarImplementation',
      'BaseRegistrarImplementation:contract',
    ],
    dependencies: ['ENSRegistry'],
  },
)
