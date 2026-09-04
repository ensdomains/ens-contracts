import { artifacts, deployScript } from '@rocketh'

export default deployScript(
  async ({ deploy, get, read, execute: write, namedAccounts }) => {
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
    // `00_setup_base_registrar` may already have transferred the registrar to
    // RegistrarSecurityController, which is then the only account the registrar
    // accepts a resolver change from. Nothing orders the two scripts, so route
    // through the controller when it holds the registrar; the direct call still
    // applies when `owner` does.
    const registrarOwner = (await read(registrar, {
      functionName: 'owner',
    })) as `0x${string}`
    const securityController = get<
      (typeof artifacts.RegistrarSecurityController)['abi']
    >('RegistrarSecurityController')
    if (
      registrarOwner.toLowerCase() === securityController.address.toLowerCase()
    ) {
      await write(securityController, {
        functionName: 'setRegistrarResolver',
        args: [ethOwnedResolver.address],
        account: owner,
      })
    } else {
      await write(registrar, {
        functionName: 'setResolver',
        args: [ethOwnedResolver.address],
        account: owner,
      })
    }
  },
  {
    id: 'EthOwnedResolver v1.0.0',
    tags: ['category:resolvers', 'OwnedResolver', 'EthOwnedResolver'],
    dependencies: ['ENSRegistry', 'BaseRegistrarImplementation'],
  },
)
