import { artifacts, deployScript } from '@rocketh'

export default deployScript(
  async ({ deploy, get, execute: write, namedAccounts }) => {
    const { deployer, owner } = namedAccounts

    // Deploy OwnedResolver
    const ethOwnedResolver = await deploy('OwnedResolver', {
      account: deployer,
      artifact: artifacts.OwnedResolver,
      args: [],
    })

    if (!ethOwnedResolver.newlyDeployed) return

    if (owner !== deployer) {
      console.log(`  - Transferring ownership of OwnedResolver to ${owner}`)
      await write(ethOwnedResolver, {
        functionName: 'transferOwnership',
        args: [owner],
        account: deployer,
      })
    }

    const registrar = get<
      (typeof artifacts.BaseRegistrarImplementation)['abi']
    >('BaseRegistrarImplementation')

    console.log(`  - Setting resolver for .eth to ${ethOwnedResolver.address}`)
    await write(registrar, {
      functionName: 'setResolver',
      args: [ethOwnedResolver.address],
      account: owner,
    })
  },
  {
    id: 'EthOwnedResolver v1.0.0',
    tags: ['category:resolvers', 'OwnedResolver', 'EthOwnedResolver'],
    dependencies: ['ENSRegistry', 'BaseRegistrarImplementation'],
  },
)
