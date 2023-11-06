import { namehash } from 'ethers/lib/utils'
import { ethers } from 'hardhat'
import { DeployFunction } from 'hardhat-deploy/types'
import { HardhatRuntimeEnvironment } from 'hardhat/types'

// Replace with coinid of L2
const NAMESPACE = 'optimism'

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, deployments, network } = hre
  const { deploy } = deployments
  const { deployer } = await getNamedAccounts()

  await deploy('L2ReverseRegistrar', {
    from: deployer,
    args: [namehash(`${NAMESPACE}.reverse`)],
    log: true,
  })
}

func.id = 'l2-reverse-registrar'
func.tags = ['L2ReverseRegistrar']
func.dependencies = []

export default func
