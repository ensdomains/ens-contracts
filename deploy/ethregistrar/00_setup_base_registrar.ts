import namehash from 'eth-ens-namehash'
import { ethers } from 'hardhat'
import { DeployFunction } from 'hardhat-deploy/types'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { keccak256 } from 'js-sha3'

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, deployments, network } = hre
  const { deployer, owner } = await getNamedAccounts()

  if (!network.tags.use_root) {
    return true
  }

  const root = await ethers.getContract('Root')
  const registrar = await ethers.getContract('BaseRegistrarImplementation')

  console.log('Running base registrar setup')

  const tx1 = await registrar.transferOwnership(owner, { from: deployer })
  console.log(
    `Transferring ownership of registrar to owner (tx: ${tx1.hash})...`,
  )
  await tx1.wait()

  const tx2 = await root
    .connect(await ethers.getSigner(owner))
    .setSubnodeOwner('0x' + keccak256('eth'), registrar.address)
  console.log(
    `Setting owner of eth node to registrar on root (tx: ${tx2.hash})...`,
  )
  await tx2.wait()
}

func.id = 'setupRegistrar'
func.tags = ['setupRegistrar']
//Runs after the root is setup
func.dependencies = ['setupRoot']

export default func
