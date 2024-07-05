import type { DeployFunction } from 'hardhat-deploy/types.js'

const func: DeployFunction = async function (hre) {
  const { deployments, network, viem } = hre

  const registry = await viem.getContract('ENSRegistry')

  if (!network.tags.legacy) {
    return
  }

  await viem.deploy('LegacyPublicResolver', [registry.address], {
    artifact: await deployments.getArtifact('PublicResolver_mainnet_9412610'),
  })

  return true
}

func.id = 'legacy-resolver'
func.tags = ['resolvers', 'LegacyPublicResolver']
func.dependencies = ['registry', 'wrapper']

export default func
