import { deployScript } from '@rocketh'
import { Artifact_ExtendedDNSResolver } from 'generated/artifacts/ExtendedDNSResolver.js'

export default deployScript(
  async ({ deploy, namedAccounts }) => {
    const { deployer } = namedAccounts

    // Deploy ExtendedDNSResolver
    await deploy('ExtendedDNSResolver', {
      account: deployer,
      artifact: Artifact_ExtendedDNSResolver,
      args: [],
    })

    return true;
  },
  {
    id: 'ExtendedDNSResolver v1.0.0',
    tags: ['category:resolvers', 'ExtendedDNSResolver'],
    dependencies: [],
  },
)
