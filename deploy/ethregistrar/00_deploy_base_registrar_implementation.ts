import type { DeployFunction } from 'hardhat-deploy/types.js'
import { namehash } from 'viem/ens'

const func: DeployFunction = async function (hre) {
  const { network, viem } = hre

  if (!network.tags.use_root) {
    return true
  }

  const registry = await viem.getContract('ENSRegistry')

  const bri = await viem.deploy('BaseRegistrarImplementation', [
    registry.address,
    namehash('eth'),
  ])
  if (!bri.newlyDeployed) return
}

func.id = 'registrar'
func.tags = ['ethregistrar', 'BaseRegistrarImplementation']
func.dependencies = ['registry', 'root']

export default func
