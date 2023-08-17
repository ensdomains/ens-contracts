import { ethers } from 'hardhat'
import { DeployFunction } from 'hardhat-deploy/types'
import { HardhatRuntimeEnvironment } from 'hardhat/types'

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, deployments, network } = hre
  const { deploy } = deployments
  const { deployer, owner } = await getNamedAccounts()

  if (!network.tags.use_root) {
    return true
  }

  const registry = await ethers.getContract('ENSRegistry')

  await deploy('Root', {
    from: deployer,
    args: [registry.address],
    log: true,
  })

  return true
}

func.id = 'root'
func.tags = ['root', 'Root']
func.dependencies = ['ENSRegistry']

export default func
