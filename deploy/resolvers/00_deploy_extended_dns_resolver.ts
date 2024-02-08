import { DeployFunction } from 'hardhat-deploy/types'
import { HardhatRuntimeEnvironment } from 'hardhat/types'

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, deployments } = hre
  const { deploy } = deployments
  const { deployer } = await getNamedAccounts()

  await deploy('ExtendedDNSResolver', {
    from: deployer,
    args: [],
    log: true,
  })
}

func.tags = ['resolvers', 'ExtendedDNSResolver']

export default func
