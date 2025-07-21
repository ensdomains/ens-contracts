import { execute, artifacts } from '@rocketh'
import { namehash } from 'viem'

export default execute(
  async ({ deploy, get, namedAccounts, viem }) => {
    const { deployer, owner } = namedAccounts

    // Deploy OwnedResolver
    const ethOwnedResolver = await deploy('OwnedResolver', {
      account: deployer,
      artifact: artifacts.OwnedResolver,
      args: [],
    })

    if (!ethOwnedResolver.newlyDeployed) return

    const registry = await get('ENSRegistry')
    const registrar = await get('BaseRegistrarImplementation')

    // using 'as any' because rocketh's dynamic proxy doesn't have full type safety
    const setResolverHash = await (registrar as any).write.setResolver(
      [ethOwnedResolver.address],
      { account: owner.account },
    )
    await viem.waitForTransactionSuccess(setResolverHash)

    const resolver = await (registry as any).read.resolver([namehash('eth')])
    console.log(`set resolver for .eth to ${resolver}`)
  },
  {
    id: 'EthOwnedResolver v1.0.0',
    tags: ['category:resolvers', 'OwnedResolver', 'EthOwnedResolver'],
    dependencies: ['ENSRegistry', 'BaseRegistrarImplementation'],
  },
)
