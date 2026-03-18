import { deployScript } from '@rocketh'
import { Artifact_DummyOracle } from 'generated/artifacts/DummyOracle.js'
import { Artifact_ExponentialPremiumPriceOracle } from 'generated/artifacts/ExponentialPremiumPriceOracle.js'
import type { Address } from 'viem'

export default deployScript(
  async ({ deploy, namedAccounts, network }) => {
    const { deployer } = namedAccounts

    let oracleAddress: Address = '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419'
    if (network.chain.id !== 1) {
      const dummyOracle = await deploy('DummyOracle', {
        account: deployer,
        artifact: Artifact_DummyOracle,
        args: [160000000000n],
      })
      oracleAddress = dummyOracle.address
    }

    await deploy('ExponentialPremiumPriceOracle', {
      account: deployer,
      artifact: Artifact_ExponentialPremiumPriceOracle,
      args: [
        oracleAddress,
        [0n, 0n, 20294266869609n, 5073566717402n, 158548959919n],
        100000000000000000000000000n,
        21n,
      ],
    })

    return true;
  },
  {
    id: 'ExponentialPremiumPriceOracle v1.0.0',
    tags: [
      'category:ethregistrar',
      'ExponentialPremiumPriceOracle',
      'DummyOracle',
    ],
    dependencies: [],
  },
)
