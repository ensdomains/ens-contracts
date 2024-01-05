import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { deploy } = deployments
  const { deployer } = await getNamedAccounts()
  console.log(1)
  const impl = await deploy('DelegatableResolver', {
    from: deployer,
    args: [],
    log: true,
  })
  console.log(2)
  const implAddress = impl.address
  console.log(`DelegatableResolver is deployed at ${implAddress}`)
  console.log(3)
}
export default func
func.tags = ['DelegatableResolver', 'l2']
