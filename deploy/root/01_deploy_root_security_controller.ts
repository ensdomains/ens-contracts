import { deployScript } from '@rocketh'
import type { Abi_Root } from 'generated/abis/Root.js'
import { Artifact_RootSecurityController } from 'generated/artifacts/RootSecurityController.js'

export default deployScript(
  async ({ deploy, get, execute: write, namedAccounts, tags }) => {
    const { deployer, owner } = namedAccounts

    if (!tags?.use_root) {
      return
    }

    const root = get<Abi_Root>('Root')

    const securityController = await deploy('RootSecurityController', {
      account: deployer,
      artifact: Artifact_RootSecurityController,
      args: [root.address],
    })

    if (!securityController.newlyDeployed) return

    if (owner && owner !== deployer) {
      console.log(
        `  - Transferring ownership of RootSecurityController to ${owner}`,
      )
      await write(securityController, {
        functionName: 'transferOwnership',
        args: [owner],
        account: deployer,
      })
    }
  },
  {
    id: 'RootSecurityController v1.0.0',
    tags: ['category:root', 'RootSecurityController'],
    dependencies: ['Root:contract'],
  },
)
