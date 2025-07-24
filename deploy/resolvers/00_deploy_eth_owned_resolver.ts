import { execute, artifacts } from '@rocketh'
import { namehash, encodeFunctionData } from 'viem'

export default execute(
  async ({ deploy, get, tx, namedAccounts }) => {
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

    try {
      // Set resolver for .eth domain using tx function
      await tx({
        to: registrar.address,
        data: encodeFunctionData({
          abi: registrar.abi,
          functionName: 'setResolver',
          args: [ethOwnedResolver.address],
        }),
        account: owner,
      })
      console.log(`Set resolver for .eth to ${ethOwnedResolver.address}`)
    } catch (error) {
      console.log('ETH resolver setup error:', error.message)
      console.log('ETH resolver setup completed with errors')
    }
  },
  {
    id: 'EthOwnedResolver v1.0.0',
    tags: ['category:resolvers', 'OwnedResolver', 'EthOwnedResolver'],
    dependencies: ['ENSRegistry', 'BaseRegistrarImplementation'],
  },
)
