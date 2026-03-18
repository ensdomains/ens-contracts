import { deployScript } from '@rocketh'
import type { Abi_BaseRegistrarImplementation } from 'generated/abis/BaseRegistrarImplementation.js'
import type { Abi_ENSRegistry } from 'generated/abis/ENSRegistry.js'
import type { Abi_ExponentialPremiumPriceOracle } from 'generated/abis/ExponentialPremiumPriceOracle.js'
import type { Abi_NameWrapper } from 'generated/abis/NameWrapper.js'
import type { Abi_RegistrarSecurityController } from 'generated/abis/RegistrarSecurityController.js'
import type { Abi_ReverseRegistrar } from 'generated/abis/ReverseRegistrar.js'
import { Artifact_OwnedResolver } from 'generated/artifacts/OwnedResolver.js'
import type { Artifact } from 'rocketh/types'
import { namehash, zeroAddress, type Abi } from 'viem'
import wrappedEthRegistrarArtifactRaw from '../../deployments/mainnet/WrappedETHRegistrarController.json'

const wrappedEthRegistrarArtifact =
  wrappedEthRegistrarArtifactRaw as unknown as Artifact<Abi>

export default deployScript(
  async ({
    deploy,
    get,
    execute: write,
    read,
    namedAccounts,
    network,
    tags,
    registerWrappedNames,
  }) => {
    const { deployer, owner } = namedAccounts

    const registry = get<Abi_ENSRegistry>('ENSRegistry')
    const registrar = get<
      Abi_BaseRegistrarImplementation
    >('BaseRegistrarImplementation')
    const registrarSecurityController = get<
      Abi_RegistrarSecurityController
    >('RegistrarSecurityController')
    const priceOracle = get<
      Abi_ExponentialPremiumPriceOracle
    >('ExponentialPremiumPriceOracle')
    const reverseRegistrar =
      get<Abi_ReverseRegistrar>('ReverseRegistrar')
    const nameWrapper =
      get<Abi_NameWrapper>('NameWrapper')
  
    delete (wrappedEthRegistrarArtifact as unknown as { address?: string }).address

    const controller = await deploy('WrappedETHRegistrarController', {
      account: deployer,
      artifact: wrappedEthRegistrarArtifact,
      args: [
        registrar.address,
        priceOracle.address,
        60n,
        86400n,
        reverseRegistrar.address,
        nameWrapper.address,
        registry.address,
      ],
    })

    if (!controller.newlyDeployed) return

    // Transfer ownership to owner
    if (owner !== deployer) {
      console.log(
        `  - Transferring ownership of WrappedETHRegistrarController to ${owner}`,
      )
      await write(controller, {
        functionName: 'transferOwnership',
        args: [owner],
        account: deployer,
      })
    }

    // Only attempt to make controller etc changes directly on testnets
    if (network.chain.id === 1 && !tags?.tenderly) return

    console.log(
      '  - Adding WrappedETHRegistrarController as controller on NameWrapper',
    )
    await write(nameWrapper, {
      functionName: 'setController',
      args: [controller.address, true],
      account: owner,
    })

    // Add controller to BaseRegistrarImplementation
    console.log(
      `  - Adding WrappedETHRegistrarController via RegistrarSecurityController`,
    )
    await write(registrarSecurityController, {
      functionName: 'addRegistrarController',
      args: [controller.address],
      account: owner,
    })

    // Add controller to ReverseRegistrar
    console.log(
      `  - Adding WrappedETHRegistrarController as controller on ReverseRegistrar`,
    )
    await write(reverseRegistrar, {
      functionName: 'setController',
      args: [controller.address, true],
      account: owner,
    })

    // Set interface on resolver
    const interfaceId = '0x612e8c09'

    const resolver = await read(registry, {
      functionName: 'resolver',
      args: [namehash('eth')],
    })
    if (resolver === zeroAddress) {
      console.warn(
        `  - WARN: No resolver set for .eth; not setting interface ${interfaceId} for WrappedETHRegistrarController`,
      )
      return
    }

    console.log(
      `  - Setting WrappedETHRegistrarController interface ID ${interfaceId} on .eth resolver`,
    )
    await write(
      { ...Artifact_OwnedResolver, address: resolver },
      {
        functionName: 'setInterface',
        args: [namehash('eth'), interfaceId, controller.address],
        account: owner,
      },
    )

    if (registerWrappedNames) {
      console.log('  - Running registerWrappedNames hook')
      await registerWrappedNames()
    }

    return true;
  },
  {
    id: 'ETHRegistrarController v2.0.0',
    tags: ['category:ethregistrar', 'WrappedETHRegistrarController'],
    dependencies: [
      'ENSRegistry',
      'BaseRegistrarImplementation',
      'RegistrarSecurityController',
      'ExponentialPremiumPriceOracle',
      'ReverseRegistrar',
      'NameWrapper',
      'EthOwnedResolver',
    ],
  },
)
