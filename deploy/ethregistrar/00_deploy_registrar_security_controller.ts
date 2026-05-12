import { artifacts, deployScript } from '@rocketh'

export default deployScript(
  async ({ deploy, get, execute: write, namedAccounts, network }) => {
    const { deployer, owner } = namedAccounts

    if (!network.tags?.use_root) return

    const registrar = get<
      (typeof artifacts.BaseRegistrarImplementation)['abi']
    >('BaseRegistrarImplementation')

    const securityController = await deploy('RegistrarSecurityController', {
      account: deployer,
      artifact: artifacts.RegistrarSecurityController,
      args: [registrar.address],
    })

    if (!securityController.newlyDeployed) return

    if (owner && owner !== deployer) {
      console.log(
        `  - Transferring ownership of RegistrarSecurityController to ${owner}`,
      )
      await write(securityController, {
        functionName: 'transferOwnership',
        args: [owner],
        account: deployer,
      })
    }
  },
  {
    id: 'RegistrarSecurityController v1.0.0',
    tags: [
      'category:ethregistrar',
      'RegistrarSecurityController',
      'RegistrarSecurityController:contract',
    ],
    dependencies: ['BaseRegistrarImplementation:contract'],
  },
)
