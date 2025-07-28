import type { DeployFunction } from 'hardhat-deploy/types.js'

const func: DeployFunction = async function (hre) {
  const { owner } = await hre.viem.getNamedClients()

  const registry = await hre.viem.getContract('ENSRegistry')

  const batchGatewayProvider = await hre.viem.getContract(
    'BatchGatewayProvider' as 'GatewayProvider',
  )

  await hre.viem.deploy('UniversalResolver', [
    owner.address,
    registry.address,
    batchGatewayProvider.address,
  ])

  return true
}

func.id = 'UniversalResolver v1.0.1'
func.tags = ['category:utils', 'UniversalResolver']
func.dependencies = ['ENSRegistry', 'BatchGatewayProvider']

export default func
