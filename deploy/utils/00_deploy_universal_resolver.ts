import type { DeployFunction } from 'hardhat-deploy/types.js'

const func: DeployFunction = async function (hre) {
  const { deployments, viem } = hre
  const { deploy } = deployments

  const { deployer, owner } = await viem.getNamedClients()

  const registry = await viem.getContract('ENSRegistry')
  const batchGatewayURLs = JSON.parse(process.env.BATCH_GATEWAY_URLS || '[]')

  if (batchGatewayURLs.length === 0) {
    throw new Error('UniversalResolver: No batch gateway URLs provided')
  }

  await viem.deploy('UniversalResolver', [registry.address, batchGatewayURLs])

  if (owner !== undefined && owner.address !== deployer.address) {
    const universalResolver = await viem.getContract('UniversalResolver')
    const hash = await universalResolver.write.transferOwnership([
      owner.address,
    ])
    console.log(`Transfer ownership to ${owner.address} (tx: ${hash})...`)
    await viem.waitForTransactionSuccess(hash)
  }
}

func.id = 'universal-resolver'
func.tags = ['utils', 'UniversalResolver']
func.dependencies = ['registry']

export default func
