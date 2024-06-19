import type { DeployFunction } from 'hardhat-deploy/types.js'
import type { Address } from 'viem'

const func: DeployFunction = async function (hre) {
  const { network, viem } = hre

  let oracleAddress: Address = '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419'
  if (network.name !== 'mainnet') {
    const dummyOracle = await viem.deploy('DummyOracle', [160000000000n])
    oracleAddress = dummyOracle.address
  }

  await viem.deploy('ExponentialPremiumPriceOracle', [
    oracleAddress,
    [0n, 0n, 20294266869609n, 5073566717402n, 158548959919n],
    100000000000000000000000000n,
    21n,
  ])
}

func.id = 'price-oracle'
func.tags = ['ethregistrar', 'ExponentialPremiumPriceOracle', 'DummyOracle']
func.dependencies = ['registry']

export default func
