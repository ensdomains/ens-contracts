import type { DeployFunction } from 'hardhat-deploy/types.js'

const func: DeployFunction = async function (hre) {
  const { viem } = hre

  const delagatableResolver = await viem.getContract('DelegatableResolver')
  const factory = await viem.deploy('DelegatableResolverFactory', [
    delagatableResolver.address,
  ])

  console.log(
    `DelegatableResolverFactory is deployed at ${factory.address} with ${delagatableResolver.address}`,
  )
}

func.dependencies = ['DelegatableResolver']
func.tags = ['DelegatableResolverFactory', 'l2']

export default func
