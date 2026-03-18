import { deployScript } from '@rocketh'
import type { Abi_BaseRegistrarImplementation } from 'generated/abis/BaseRegistrarImplementation.js'
import type { Abi_RegistrarSecurityController } from 'generated/abis/RegistrarSecurityController.js'
import type { Abi_Root } from 'generated/abis/Root.js'
import { labelhash } from 'viem'

export default deployScript(
  async ({
    get,
    execute: write,
    namedAccounts: { deployer, owner },
    tags,
  }) => {
    if (!tags.use_root) return

    const root = get<Abi_Root>('Root')
    const registrar = get<Abi_BaseRegistrarImplementation>('BaseRegistrarImplementation')
    const registrarSecurityController = get<Abi_RegistrarSecurityController>('RegistrarSecurityController')

    // 1. Transfer ownership of registrar to RegistrarSecurityController
    console.log(
      `  - Transferring ownership of registrar to RegistrarSecurityController`,
    )
    await write(registrar, {
      functionName: 'transferOwnership',
      args: [registrarSecurityController.address],
      account: deployer,
    })

    // 2. Set owner of eth node to registrar on root
    console.log(`  - Setting owner of eth node to registrar on root`)
    await write(root, {
      functionName: 'setSubnodeOwner',
      args: [labelhash('eth'), registrar.address],
      account: owner,
    })

    return true;
  },
  {
    id: 'BaseRegistrarImplementation:setup v1.0.0',
    tags: [
      'category:ethregistrar',
      'BaseRegistrarImplementation',
      'BaseRegistrarImplementation:setup',
    ],
    // Runs after the root is setup
    dependencies: [
      'Root',
      'BaseRegistrarImplementation:contract',
      'RegistrarSecurityController:contract',
    ],
  },
)
