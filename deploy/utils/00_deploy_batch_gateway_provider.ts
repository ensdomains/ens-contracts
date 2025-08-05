import type { DeployFunction } from 'hardhat-deploy/types.js'

const func: DeployFunction = async function (hre) {
  const { deployer, owner } = await hre.viem.getNamedClients()

  const batchGatewayURLs: string[] = JSON.parse(
    process.env.BATCH_GATEWAY_URLS || '[]',
  )

  if (!batchGatewayURLs.length) {
    throw new Error('BatchGatewayProvider: No batch gateway URLs provided')
  }

  await hre.viem.deploy(
    'BatchGatewayProvider',
    [(owner ?? deployer).address, batchGatewayURLs],
    {
      artifact: await hre.deployments.getArtifact('GatewayProvider'),
    },
  )

  return true
}

func.id = 'BatchGatewayProvider v1.0.0'
func.tags = ['category:utils', 'BatchGatewayProvider']

export default func
