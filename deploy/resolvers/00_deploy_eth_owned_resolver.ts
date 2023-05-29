import { DeployFunction } from 'hardhat-deploy/types'
import { HardhatRuntimeEnvironment } from 'hardhat/types'

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, deployments } = hre
  const { deploy } = deployments
  const { deployer } = await getNamedAccounts()

  const deployArgs = {
    from: deployer,
    args: [],
    log: true,
  }
  const ethOwnedResolver = await deploy('OwnedResolver', deployArgs)
  if (!ethOwnedResolver.newlyDeployed) return
}

func.id = 'owned-resolver'
func.tags = ['resolvers', 'OwnedResolver']
func.dependencies = []

export default func
