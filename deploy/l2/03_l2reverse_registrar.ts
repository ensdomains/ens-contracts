import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'
import { convertEVMChainIdToCoinType } from '@ensdomains/address-encoder'

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { deploy } = deployments

  const { deployer } = await getNamedAccounts()
  const chainId = hre.network.config.chainId!
  const coinType = convertEVMChainIdToCoinType(chainId)
  const REVERSE_NAMESPACE = `${coinType}.reverse`
  const REVERSENODE = ethers.utils.namehash(REVERSE_NAMESPACE)
  console.log(
    `REVERSE_NAMESPACE for chainId ${chainId} is ${REVERSE_NAMESPACE}`,
  )
  console.log(
    `Deploying L2ReverseResolver with REVERSENODE ${REVERSENODE} and coinType ${coinType}`,
  )
  await deploy('L2ReverseResolver', {
    from: deployer,
    args: [REVERSENODE, coinType],
    log: true,
  })
}
export default func
func.tags = ['L2ReverseResolver', 'l2']
