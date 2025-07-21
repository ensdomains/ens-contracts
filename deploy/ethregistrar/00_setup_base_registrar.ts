import { execute } from '@rocketh'
import { labelhash } from 'viem'

export default execute(
  async ({ get, execute: executeContract, namedAccounts, network }) => {
    const { deployer, owner } = namedAccounts

    if (!network.tags?.use_root) {
      return
    }

    const root = await get('Root')
    const registrar = await get('BaseRegistrarImplementation')

    console.log('Running base registrar setup')

    // 1. Transfer ownership of registrar to owner
    await executeContract(registrar, {
      functionName: 'transferOwnership',
      args: [owner],
      account: deployer,
    })
    console.log(`Transferred ownership of registrar to ${owner}`)

    // 2. Set owner of eth node to registrar on root
    await executeContract(root, {
      functionName: 'setSubnodeOwner',
      args: [labelhash('eth'), registrar.address],
      account: owner,
    })
    console.log(`Set owner of eth node to registrar on root`)
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
