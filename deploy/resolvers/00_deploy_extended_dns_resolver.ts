import { artifacts, deployScript } from '@rocketh'

export default deployScript(
  async ({ deploy, namedAccounts }) => {
    const { deployer } = namedAccounts

    // Deploy ExtendedDNSResolver
    await deploy('ExtendedDNSResolver', {
      account: deployer,
      artifact: artifacts.ExtendedDNSResolver,
      args: [],
    })
  },
  {
    id: 'ExtendedDNSResolver v1.0.0',
    tags: ['category:resolvers', 'ExtendedDNSResolver'],
    dependencies: [],
  },
)
