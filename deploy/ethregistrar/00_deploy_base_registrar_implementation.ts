import namehash from 'eth-ens-namehash'
import { ethers } from 'hardhat'
import { DeployFunction } from 'hardhat-deploy/types'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { sha3 } from 'web3-utils'

const func: DeployFunction = async function(hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, deployments, network } = hre
  const { deploy } = deployments
  const { deployer, owner } = await getNamedAccounts()

  if (!network.tags.use_root) {
    return true
  }

  const registry = await ethers.getContract('ENSRegistry')
  const root = await ethers.getContract('Root')

  await deploy('BaseRegistrarImplementation', {
    from: deployer,
    args: [registry.address, namehash.hash('eth')],
    log: true,
  })

  const registrar = await ethers.getContract('BaseRegistrarImplementation')

  const tx1 = await registrar.addController(owner, { from: deployer })
  console.log(`Adding owner as controller to registrar (tx: ${tx1.hash})...`)
  await tx1.wait()

  const tx2 = await root
    .attach(owner)
    .setSubnodeOwner(sha3('eth'), registrar.address)
  console.log(
    `Setting owner of eth node to registrar on root (tx: ${tx2.hash})...`,
  )
  await tx2.wait()
}

func.id = 'registrar'
func.tags = ['ethregistrar', 'BaseRegistrarImplementation']
func.dependencies = ['registry', 'root']

export default func
