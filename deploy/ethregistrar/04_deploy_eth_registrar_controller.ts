import { deployScript } from '@rocketh'
import type { Abi_BaseRegistrarImplementation } from 'generated/abis/BaseRegistrarImplementation.js'
import type { Abi_DefaultReverseRegistrar } from 'generated/abis/DefaultReverseRegistrar.js'
import type { Abi_ENSRegistry } from 'generated/abis/ENSRegistry.js'
import type { Abi_ExponentialPremiumPriceOracle } from 'generated/abis/ExponentialPremiumPriceOracle.js'
import { Abi_IETHRegistrarController } from 'generated/abis/IETHRegistrarController.js'
import type { Abi_RegistrarSecurityController } from 'generated/abis/RegistrarSecurityController.js'
import type { Abi_ReverseRegistrar } from 'generated/abis/ReverseRegistrar.js'
import { Artifact_ETHRegistrarController } from 'generated/artifacts/ETHRegistrarController.js'
import { Artifact_OwnedResolver } from 'generated/artifacts/OwnedResolver.js'
import { namehash, zeroAddress } from 'viem'
import { createInterfaceId } from '../../test/fixtures/createInterfaceId.js'

export default deployScript(
  async ({
    deploy,
    get,
    execute: write,
    read,
    namedAccounts,
    network,
    tags,
    registerUnwrappedNames,
  }) => {
    const { deployer, owner } = namedAccounts

    const registry = get<Abi_ENSRegistry>('ENSRegistry')
    const registrar = get<Abi_BaseRegistrarImplementation>(
      'BaseRegistrarImplementation',
    )
    const registrarSecurityController = get<Abi_RegistrarSecurityController>(
      'RegistrarSecurityController',
    )
    const priceOracle = get<Abi_ExponentialPremiumPriceOracle>(
      'ExponentialPremiumPriceOracle',
    )
    const reverseRegistrar =
      get<Abi_ReverseRegistrar>('ReverseRegistrar')
    const defaultReverseRegistrar = get<Abi_DefaultReverseRegistrar>(
      'DefaultReverseRegistrar',
    )

    const controller = await deploy('ETHRegistrarController', {
      account: deployer,
      artifact: Artifact_ETHRegistrarController,
      args: [
        registrar.address,
        priceOracle.address,
        60n,
        86400n,
        reverseRegistrar.address,
        defaultReverseRegistrar.address,
        registry.address,
      ],
    })

    if (!controller.newlyDeployed) return

    // Transfer ownership to owner
    if (owner !== deployer) {
      console.log(
        `  - Transferring ownership of ETHRegistrarController to ${owner}`,
      )
      await write(controller, {
        functionName: 'transferOwnership',
        args: [owner],
        account: deployer,
      })
    }

    // Only attempt to make controller etc changes directly on testnets
    if (network.chain.id === 1 && !tags?.tenderly) return

    // Add controller to BaseRegistrarImplementation
    console.log(
      `  - Adding ETHRegistrarController via RegistrarSecurityController`,
    )
    await write(registrarSecurityController, {
      functionName: 'addRegistrarController',
      args: [controller.address],
      account: owner,
    })

    // Add controller to ReverseRegistrar
    console.log(
      `  - Adding ETHRegistrarController as controller on ReverseRegistrar`,
    )
    await write(reverseRegistrar, {
      functionName: 'setController',
      args: [controller.address, true],
      account: owner,
    })

    // Add controller to DefaultReverseRegistrar
    console.log(
      `  - Adding ETHRegistrarController as controller on DefaultReverseRegistrar`,
    )
    await write(defaultReverseRegistrar, {
      functionName: 'setController',
      args: [controller.address, true],
      account: owner,
    })

    // Set interface on resolver
    const interfaceId = createInterfaceId(Abi_IETHRegistrarController)

    const resolver = await read(registry, {
      functionName: 'resolver',
      args: [namehash('eth')],
    })
    if (resolver === zeroAddress) {
      console.warn(
        `  - WARN: No resolver set for .eth; not setting interface ${interfaceId} for ETHRegistrarController`,
      )
      return
    }

    console.log(
      `  - Setting ETHRegistrarController interface ID ${interfaceId} on .eth resolver`,
    )
    await write(
      { ...Artifact_OwnedResolver, address: resolver },
      {
        functionName: 'setInterface',
        args: [namehash('eth'), interfaceId, controller.address],
        account: owner,
      },
    )

    if (registerUnwrappedNames) {
      console.log('  - Running registerUnwrappedNames hook')
      await registerUnwrappedNames()
    }

    return true;
  },
  {
    id: 'ETHRegistrarController v3.0.0',
    tags: ['category:ethregistrar', 'ETHRegistrarController'],
    dependencies: [
      'ENSRegistry',
      'BaseRegistrarImplementation',
      'RegistrarSecurityController',
      'ExponentialPremiumPriceOracle',
      'ReverseRegistrar',
      'DefaultReverseRegistrar',
      'NameWrapper',
      'EthOwnedResolver',
    ],
  },
)
