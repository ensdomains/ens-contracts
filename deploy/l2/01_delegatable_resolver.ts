import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { deploy } = deployments
  const { deployer } = await getNamedAccounts()
  const impl = await deploy('DelegatableResolver', {
    from: deployer,
    args: [],
    log: true,
  })
  const implAddress = impl.address
  console.log(`DelegatableResolver is deployed at ${implAddress}`)
}
export default func
func.tags = ['DelegatableResolver', 'l2']
