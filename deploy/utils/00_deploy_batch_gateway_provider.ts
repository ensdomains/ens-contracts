import { execute, artifacts } from '@rocketh'

export default execute(
  async ({ deploy, namedAccounts }) => {
    const { deployer, owner } = namedAccounts

    const batchGatewayURLs: string[] = JSON.parse(
      process.env.BATCH_GATEWAY_URLS || '[]',
    )

    if (!batchGatewayURLs.length) {
      throw new Error('BatchGatewayProvider: No batch gateway URLs provided')
    }
    await deploy('BatchGatewayProvider', {
      account: deployer,
      artifact: artifacts.GatewayProvider,
      args: [owner ?? deployer, batchGatewayURLs],
    })
  },
  {
    id: 'BatchGatewayProvider v1.0.0',
    tags: ['category:utils', 'BatchGatewayProvider'],
  },
)
