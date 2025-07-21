import { execute, artifacts } from '@rocketh'

export default execute(
  async ({ deploy, get, namedAccounts, viem }) => {
    const { deployer, owner } = namedAccounts

    // Get dependencies
    const registry = await get('ENSRegistry')

    // Get batch gateway URLs from environment
    const batchGatewayURLs: string[] = JSON.parse(
      process.env.BATCH_GATEWAY_URLS || '[]',
    )

    if (batchGatewayURLs.length === 0) {
      throw new Error('UniversalResolver: No batch gateway URLs provided')
    }

    // Deploy UniversalResolver
    await deploy('UniversalResolver', {
      account: deployer,
      artifact: artifacts.UniversalResolver,
      args: [registry.address, batchGatewayURLs],
    })

    // Transfer ownership to owner
    if (owner && owner.address !== deployer.address) {
      const universalResolver = await get('UniversalResolver')
      // Note: using 'as any' because rocketh's dynamic proxy doesn't have full type safety
      const hash = await (universalResolver as any).write.transferOwnership(
        [owner.address],
        {
          account: deployer,
        },
      )
      console.log(`Transfer ownership to ${owner.address} (tx: ${hash})...`)
      await viem.waitForTransactionSuccess(hash)
    }
  },
  {
    id: 'UniversalResolver v1.0.0',
    tags: ['category:utils', 'UniversalResolver'],
    dependencies: ['ENSRegistry'],
  },
)
