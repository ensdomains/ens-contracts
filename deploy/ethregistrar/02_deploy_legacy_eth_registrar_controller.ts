import { deployScript } from '@rocketh'
import type { Abi_BaseRegistrarImplementation } from 'generated/abis/BaseRegistrarImplementation.js'
import type { Abi_ExponentialPremiumPriceOracle } from 'generated/abis/ExponentialPremiumPriceOracle.js'
import type { Abi_RegistrarSecurityController } from 'generated/abis/RegistrarSecurityController.js'
import type { Abi } from 'viem'
import legacyArtifactRaw from '../../deployments/archive/ETHRegistrarController_mainnet_9380471.sol/ETHRegistrarController_mainnet_9380471.json'

const legacyArtifact = {
  ...legacyArtifactRaw,
  metadata: '{}',
  abi: legacyArtifactRaw.abi as Abi,
}

export default deployScript(
  async ({
    deploy,
    get,
    execute: write,
    namedAccounts,
    registerLegacyNames,
  }) => {
    const { deployer, owner } = namedAccounts

    const registrar = get<
      Abi_BaseRegistrarImplementation
    >('BaseRegistrarImplementation')
    const registrarSecurityController = get<
      Abi_RegistrarSecurityController
    >('RegistrarSecurityController')
    const priceOracle = get<
      Abi_ExponentialPremiumPriceOracle
    >('ExponentialPremiumPriceOracle')

    const controller = await deploy('LegacyETHRegistrarController', {
      account: deployer,
      artifact: legacyArtifact,
      args: [registrar.address, priceOracle.address, 60n, 86400n],
    })

    console.log(
      `  - Adding LegacyETHRegistrarController via RegistrarSecurityController`,
    )
    await write(registrarSecurityController, {
      functionName: 'addRegistrarController',
      args: [controller.address],
      account: owner,
    })

    if (registerLegacyNames) {
      console.log('  - Running registerLegacyNames hook')
      await registerLegacyNames()
    }

    return true;
  },
  {
    id: 'ETHRegistrarController v1.0.0',
    tags: ['category:ethregistrar', 'LegacyETHRegistrarController'],
    dependencies: [
      'BaseRegistrarImplementation',
      'RegistrarSecurityController',
      'ExponentialPremiumPriceOracle',
    ],
  },
)
