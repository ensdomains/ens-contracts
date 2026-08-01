import { deployScript } from '@rocketh'
import { Artifact_GatewayProvider } from 'generated/artifacts/GatewayProvider.js'

export default deployScript(
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
      artifact: Artifact_GatewayProvider,
      args: [owner ?? deployer, batchGatewayURLs],
    })

    return true;
  },
  {
    id: 'BatchGatewayProvider v1.0.0',
    tags: ['category:utils', 'BatchGatewayProvider'],
  },
)
