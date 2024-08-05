import type { DeployFunction } from 'hardhat-deploy/types.js'

const func: DeployFunction = async function (hre) {
  const { viem } = hre

  const impl = await viem.deploy('DelegatableResolver', [])
  const implAddress = impl.address
  console.log(`DelegatableResolver is deployed at ${implAddress}`)
}

func.tags = ['DelegatableResolver', 'l2']

export default func
