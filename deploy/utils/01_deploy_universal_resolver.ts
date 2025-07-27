import type { DeployFunction } from 'hardhat-deploy/types.js'
import type { Address } from 'viem'

const func: DeployFunction = async function (hre) {
  const { deployer, owner } = await hre.viem.getNamedClients()

  const registry = await hre.viem.getContract('ENSRegistry')

  const batchGatewayProvider = await hre.deployments.get('BatchGatewayProvider')

  await hre.viem.deploy('UniversalResolver', [
    registry.address,
    batchGatewayProvider.address as Address,
  ])

  if (owner !== undefined && owner.address !== deployer.address) {
    const universalResolver = await hre.viem.getContract('UniversalResolver')
    const hash = await universalResolver.write.transferOwnership([
      owner.address,
    ])
    console.log(`Transfer ownership to ${owner.address} (tx: ${hash})...`)
    await hre.viem.waitForTransactionSuccess(hash)
  }

  return true
}

func.id = 'UniversalResolver v1.0.1'
func.tags = ['category:utils', 'UniversalResolver']
func.dependencies = ['ENSRegistry', 'BatchGatewayProvider']

export default func
