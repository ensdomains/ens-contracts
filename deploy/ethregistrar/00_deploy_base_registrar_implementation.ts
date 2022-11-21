import namehash from 'eth-ens-namehash'
import { ethers } from 'hardhat'
import { DeployFunction } from 'hardhat-deploy/types'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { keccak256 } from 'js-sha3'

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, deployments, network } = hre
  const { deploy, fetchIfDifferent } = deployments
  const { deployer, owner } = await getNamedAccounts()

  if (!network.tags.use_root) {
    return true
  }

  const registry = await ethers.getContract('ENSRegistry')
  const root = await ethers.getContract('Root')

  const deployArgs = {
    from: deployer,
    args: [registry.address, namehash.hash('eth')],
    log: true,
  };

  const bri = await deploy('BaseRegistrarImplementation', deployArgs)
  if(!bri.newlyDeployed) return;

  const registrar = await ethers.getContract('BaseRegistrarImplementation')

  const tx1 = await registrar.transferOwnership(owner, { from: deployer })
  console.log(`Transferring ownership of registrar to owner (tx: ${tx1.hash})...`)
  await tx1.wait()

  const tx2 = await root
    .connect(await ethers.getSigner(owner))
    .setSubnodeOwner('0x' + keccak256('eth'), registrar.address)
  console.log(
    `Setting owner of eth node to registrar on root (tx: ${tx2.hash})...`,
  )
  await tx2.wait()
}

func.id = 'registrar'
func.tags = ['ethregistrar', 'BaseRegistrarImplementation']
func.dependencies = ['registry', 'root']

export default func
