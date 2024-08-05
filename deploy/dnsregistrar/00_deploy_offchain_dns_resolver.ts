import type { DeployFunction } from 'hardhat-deploy/types.js'

const func: DeployFunction = async function (hre) {
  const { viem } = hre

  const registry = await viem.getContract('ENSRegistry')
  const dnssec = await viem.getContract('DNSSECImpl')

  await viem.deploy('OffchainDNSResolver', [
    registry.address,
    dnssec.address,
    'https://dnssec-oracle.ens.domains/',
  ])
}

func.tags = ['OffchainDNSResolver']
func.dependencies = ['registry', 'dnssec-oracle']

export default func
