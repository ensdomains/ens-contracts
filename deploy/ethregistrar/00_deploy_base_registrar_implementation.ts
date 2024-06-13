import { ethers } from 'hardhat'
import type { DeployFunction } from 'hardhat-deploy/types.js'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { keccak256 } from 'js-sha3'
import { namehash } from 'viem/ens'

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, deployments, network } = hre
  const { deploy } = deployments
  const { deployer } = await getNamedAccounts()

  if (!network.tags.use_root) {
    return true
  }

  const registry = await ethers.getContract('ENSRegistry')

  const deployArgs = {
    from: deployer,
    args: [registry.address, namehash('eth')],
    log: true,
  }

  const bri = await deploy('BaseRegistrarImplementation', deployArgs)
  if (!bri.newlyDeployed) return
}

func.id = 'registrar'
func.tags = ['ethregistrar', 'BaseRegistrarImplementation']
func.dependencies = ['registry', 'root']

export default func
