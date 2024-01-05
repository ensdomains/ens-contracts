import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'
import { convertEVMChainIdToCoinType } from '@ensdomains/address-encoder'

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { deploy } = deployments

  const { deployer } = await getNamedAccounts()
  const chainId = hre.network.config.chainId!
  const coinType = convertEVMChainIdToCoinType(chainId)
  const REVERSE_NAMESPACE = `${coinType}.reverse.evmgateway.eth`
  const REVERSENODE = ethers.namehash(REVERSE_NAMESPACE)
  console.log(
    `REVERSE_NAMESPACE for chainId ${chainId} is ${REVERSE_NAMESPACE}`,
  )
  console.log(`Deploying L2ReverseRegistrar with ${REVERSENODE}`)
  await deploy('L2ReverseRegistrar', {
    from: deployer,
    args: [REVERSENODE],
    log: true,
    // gasPrice:20000007,
    // gas:20000007
  })
}
export default func
func.tags = ['L2ReverseRegistrar', 'l2']
