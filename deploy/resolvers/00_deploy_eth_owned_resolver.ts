import { deployScript } from '@rocketh'
import type { Abi_RegistrarSecurityController } from 'generated/abis/RegistrarSecurityController.js'
import { Artifact_OwnedResolver } from 'generated/artifacts/OwnedResolver.js'

export default deployScript(
  async ({ deploy, get, execute: write, namedAccounts }) => {
    const { deployer, owner } = namedAccounts

    // Deploy OwnedResolver
    const ethOwnedResolver = await deploy('OwnedResolver', {
      account: deployer,
      artifact: Artifact_OwnedResolver,
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

    const registrarSecurityController = get<Abi_RegistrarSecurityController>('RegistrarSecurityController')

    console.log(`  - Setting resolver for .eth to ${ethOwnedResolver.address}`)
    await write(registrarSecurityController, {
      functionName: 'setRegistrarResolver',
      args: [ethOwnedResolver.address],
      account: owner,
    })

    return true;
  },
  {
    id: 'EthOwnedResolver v1.0.0',
    tags: ['category:resolvers', 'OwnedResolver', 'EthOwnedResolver'],
    dependencies: ['ENSRegistry', 'BaseRegistrarImplementation'],
  },
)
