import { deployScript } from '@rocketh'
import type { Abi_ENSRegistry } from 'generated/abis/ENSRegistry.js'
import { Artifact_Root } from 'generated/artifacts/Root.js'

export default deployScript(
  async ({ deploy, get, namedAccounts, tags }) => {
    const { deployer } = namedAccounts

    if (!tags?.use_root) {
      return
    }

    // Get dependencies
    const registry = get<Abi_ENSRegistry>('ENSRegistry')

    // Deploy Root
    await deploy('Root', {
      account: deployer,
      artifact: Artifact_Root,
      args: [registry.address],
    })

    return true;
  },
  {
    id: 'Root:contract v1.0.0',
    tags: ['category:root', 'Root', 'Root:contract'],
    dependencies: ['ENSRegistry'],
  },
)
