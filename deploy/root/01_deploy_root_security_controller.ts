import { artifacts, deployScript } from '@rocketh'

export default deployScript(
  async ({ deploy, get, execute: write, namedAccounts, network }) => {
    const { deployer, owner } = namedAccounts

    if (!network.tags?.use_root) {
      return
    }

    const root = get<(typeof artifacts.Root)['abi']>('Root')

    const securityController = await deploy('RootSecurityController', {
      account: deployer,
      artifact: artifacts.RootSecurityController,
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
