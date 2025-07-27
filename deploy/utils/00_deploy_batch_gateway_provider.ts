import type { DeployFunction } from 'hardhat-deploy/types.js'

const func: DeployFunction = async function (hre) {
  const { deployer, owner } = await hre.viem.getNamedClients()

  const batchGatewayURLs: string[] = JSON.parse(
    process.env.BATCH_GATEWAY_URLS || '[]',
  )

  if (batchGatewayURLs.length === 0) {
    throw new Error('BatchGatewayProvider: No batch gateway URLs provided')
  }

  await hre.deployments.deploy('BatchGatewayProvider', {
    args: [batchGatewayURLs],
    contract: 'GatewayProvider',
    from: deployer.address,
  })

  // await hre.viem.deploy('GatewayProvider', [
  //   batchGatewayURLs,
  // ])

  if (owner !== undefined && owner.address !== deployer.address) {
    const universalResolver = await hre.viem.getContract('BatchGatewayProvider')
    const hash = await universalResolver.write.transferOwnership([
      owner.address,
    ])
    console.log(`Transfer ownership to ${owner.address} (tx: ${hash})...`)
    await hre.viem.waitForTransactionSuccess(hash)
  }

  return true
}

func.id = 'BatchGatewayProvider v1.0.0'
func.tags = ['category:utils', 'BatchGatewayProvider']

export default func
