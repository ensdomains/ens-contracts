import { execute } from '@rocketh'
import type { Abi } from 'viem'
import legacyArtifactRaw from '../../deployments/archive/ETHRegistrarController_mainnet_9380471.sol/ETHRegistrarController_mainnet_9380471.json'

const legacyArtifact = {
  ...legacyArtifactRaw,
  metadata: '{}',
  abi: legacyArtifactRaw.abi as Abi,
}

export default execute(
  async ({ deploy, get, namedAccounts }) => {
    const { deployer } = namedAccounts

    const registrar = await get('BaseRegistrarImplementation')
    const priceOracle = await get('ExponentialPremiumPriceOracle')
    const reverseRegistrar = await get('ReverseRegistrar')

    await deploy('LegacyETHRegistrarController', {
      account: deployer,
      artifact: legacyArtifact,
      args: [
        registrar.address,
        priceOracle.address,
        60n,
        86400n,
        reverseRegistrar.address,
      ],
    })
  },
  {
    id: 'LegacyETHRegistrarController v1.0.0',
    tags: ['category:ethregistrar', 'LegacyETHRegistrarController'],
    dependencies: [
      'BaseRegistrarImplementation',
      'ExponentialPremiumPriceOracle',
      'ReverseRegistrar',
    ],
  },
)
