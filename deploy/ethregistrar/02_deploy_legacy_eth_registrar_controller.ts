import { artifacts, execute } from '@rocketh'
import type { Abi } from 'viem'
import legacyArtifactRaw from '../../deployments/archive/ETHRegistrarController_mainnet_9380471.sol/ETHRegistrarController_mainnet_9380471.json'

const legacyArtifact = {
  ...legacyArtifactRaw,
  metadata: '{}',
  abi: legacyArtifactRaw.abi as Abi,
}

export default execute(
  async ({
    deploy,
    get,
    execute: write,
    namedAccounts,
    registerLegacyNames,
  }) => {
    const { deployer, owner } = namedAccounts

    const registrar = get<
      (typeof artifacts.BaseRegistrarImplementation)['abi']
    >('BaseRegistrarImplementation')
    const priceOracle = get<
      (typeof artifacts.ExponentialPremiumPriceOracle)['abi']
    >('ExponentialPremiumPriceOracle')

    const controller = await deploy('LegacyETHRegistrarController', {
      account: deployer,
      artifact: legacyArtifact,
      args: [registrar.address, priceOracle.address, 60n, 86400n],
    })

    console.log(
      `  - Adding LegacyETHRegistrarController as controller on BaseRegistrarImplementation`,
    )
    await write(registrar, {
      functionName: 'addController',
      args: [controller.address],
      account: owner,
    })

    if (registerLegacyNames) {
      console.log('  - Running registerLegacyNames hook')
      await registerLegacyNames()
    }
  },
  {
    id: 'ETHRegistrarController v1.0.0',
    tags: ['category:ethregistrar', 'LegacyETHRegistrarController'],
    dependencies: [
      'BaseRegistrarImplementation',
      'ExponentialPremiumPriceOracle',
    ],
  },
)
