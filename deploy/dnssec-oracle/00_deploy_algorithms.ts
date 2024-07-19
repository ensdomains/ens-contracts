import type { DeployFunction } from 'hardhat-deploy/types.js'

const func: DeployFunction = async function (hre) {
  const { network, viem } = hre

  await viem.deploy('RSASHA1Algorithm', [])
  await viem.deploy('RSASHA256Algorithm', [])
  await viem.deploy('P256SHA256Algorithm', [])

  if (network.tags.test) await viem.deploy('DummyAlgorithm', [])
}

func.tags = ['dnssec-algorithms']
func.dependencies = ['BaseRegistrarImplementation'] // not necessary but allows registrar to be deployed first

export default func
