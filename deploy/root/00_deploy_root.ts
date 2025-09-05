import { artifacts, execute } from '@rocketh'

export default execute(
  async ({ deploy, get, namedAccounts, network }) => {
    const { deployer } = namedAccounts

    if (!network.tags?.use_root) {
      return
    }

    // Get dependencies
    const registry = get<(typeof artifacts.ENSRegistry)['abi']>('ENSRegistry')

    // Deploy Root
    await deploy('Root', {
      account: deployer,
      artifact: artifacts.Root,
      args: [registry.address],
    })
  },
  {
    id: 'Root:contract v1.0.0',
    tags: ['category:root', 'Root', 'Root:contract'],
    dependencies: ['ENSRegistry'],
  },
)
