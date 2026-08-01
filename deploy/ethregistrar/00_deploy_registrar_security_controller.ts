import { deployScript } from '@rocketh'
import type { Abi_BaseRegistrarImplementation } from 'generated/abis/BaseRegistrarImplementation.js'
import { Artifact_RegistrarSecurityController } from 'generated/artifacts/RegistrarSecurityController.js'

export default deployScript(
  async ({ deploy, get, execute: write, namedAccounts, tags }) => {
    const { deployer, owner } = namedAccounts

    if (!tags?.use_root) return

    const registrar = get<Abi_BaseRegistrarImplementation>('BaseRegistrarImplementation')

    const securityController = await deploy('RegistrarSecurityController', {
      account: deployer,
      artifact: Artifact_RegistrarSecurityController,
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

    return true;
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
