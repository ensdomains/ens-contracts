import { execute, type artifacts } from '@rocketh'
import { labelhash } from 'viem'

export default execute(
  async ({
    get,
    execute: write,
    namedAccounts: { deployer, owner },
    network,
  }) => {
    if (!network.tags.use_root) return

    const root = get<(typeof artifacts.Root)['abi']>('Root')
    const registrar = get<
      (typeof artifacts.BaseRegistrarImplementation)['abi']
    >('BaseRegistrarImplementation')

    // 1. Transfer ownership of registrar to owner
    console.log(`  - Transferring ownership of registrar to ${owner}`)
    await write(registrar, {
      functionName: 'transferOwnership',
      args: [owner],
      account: deployer,
    })

    // 2. Set owner of eth node to registrar on root
    console.log(`  - Setting owner of eth node to registrar on root`)
    await write(root, {
      functionName: 'setSubnodeOwner',
      args: [labelhash('eth'), registrar.address],
      account: owner,
    })
  },
  {
    id: 'BaseRegistrarImplementation:setup v1.0.0',
    tags: [
      'category:ethregistrar',
      'BaseRegistrarImplementation',
      'BaseRegistrarImplementation:setup',
    ],
    // Runs after the root is setup
    dependencies: ['Root', 'BaseRegistrarImplementation:contract'],
  },
)
