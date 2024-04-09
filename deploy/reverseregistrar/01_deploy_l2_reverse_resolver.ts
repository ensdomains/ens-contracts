import { namehash } from 'ethers/lib/utils'
import { ethers } from 'hardhat'
import { DeployFunction } from 'hardhat-deploy/types'
import { HardhatRuntimeEnvironment } from 'hardhat/types'

// Replace with coinid of L2
const COINTYPE = 123

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, deployments, network } = hre
  const { deploy } = deployments
  const { deployer } = await getNamedAccounts()

  await deploy('L2ReverseResolver', {
    from: deployer,
    args: [namehash(`${COINTYPE}.reverse`), COINTYPE],
    log: true,
  })
}

func.id = 'l2-reverse-resolver'
func.tags = ['L2ReverseResolver']
func.dependencies = []

export default func
