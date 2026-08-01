import { deployScript } from '@rocketh'
import type { Abi_BaseRegistrarImplementation } from 'generated/abis/BaseRegistrarImplementation.js'
import type { Abi_ENSRegistry } from 'generated/abis/ENSRegistry.js'
import { Abi_INameWrapper } from 'generated/abis/INameWrapper.js'
import type { Abi_OwnedResolver } from 'generated/abis/OwnedResolver.js'
import type { Abi_RegistrarSecurityController } from 'generated/abis/RegistrarSecurityController.js'
import type { Abi_StaticMetadataService } from 'generated/abis/StaticMetadataService.js'
import { Artifact_NameWrapper } from 'generated/artifacts/NameWrapper.js'
import { encodeFunctionData, namehash, zeroAddress, type Address } from 'viem'
import { createInterfaceId } from '../../test/fixtures/createInterfaceId.js'

export default deployScript(
  async ({ deploy, get, read, execute: write, tx, namedAccounts, network, tags }) => {
    const { deployer, owner } = namedAccounts

    // Get dependencies
    const registry = get<Abi_ENSRegistry>('ENSRegistry')
    const registrar = get<Abi_BaseRegistrarImplementation>('BaseRegistrarImplementation')
    const registrarSecurityController = get<Abi_RegistrarSecurityController>('RegistrarSecurityController')
    const metadata = get<Abi_StaticMetadataService>(
      'StaticMetadataService',
    )

    // Deploy NameWrapper
    const nameWrapper = await deploy('NameWrapper', {
      account: deployer,
      artifact: Artifact_NameWrapper,
      args: [registry.address, registrar.address, metadata.address],
    })

    if (!nameWrapper.newlyDeployed) return

    // Transfer ownership to owner
    if (owner !== deployer) {
      console.log(`  - Transferring ownership of NameWrapper to ${owner}`)
      await write(nameWrapper, {
        functionName: 'transferOwnership',
        args: [owner],
        account: deployer,
      })
    }

    // Only attempt to make controller etc changes directly on testnets
    if (network.chain.id === 1 && !tags?.tenderly) return

    console.log(
      `  - Adding NameWrapper as controller via RegistrarSecurityController`,
    )
    await write(registrarSecurityController, {
      functionName: 'addRegistrarController',
      args: [nameWrapper.address],
      account: owner,
    })

    // Set NameWrapper interface on resolver
    const interfaceId = createInterfaceId(Abi_INameWrapper)

    const resolver = await read(registry, {
      functionName: 'resolver',
      args: [namehash('eth')],
    })

    if (resolver === zeroAddress) {
      console.warn(
        `  - WARN: No resolver set for .eth; not setting interface ${interfaceId} for NameWrapper`,
      )
      return
    }

    // Set interface on the resolver configured for .eth
    const ownedResolver =
      get<Abi_OwnedResolver>('OwnedResolver')
    console.log(
      `  - Setting NameWrapper interface ID ${interfaceId} on .eth resolver`,
    )
    await tx({
      to: resolver as Address,
      data: encodeFunctionData({
        abi: ownedResolver.abi,
        functionName: 'setInterface',
        args: [namehash('eth'), interfaceId, nameWrapper.address],
      }),
      account: owner,
    })

    return true
  },
  {
    id: 'NameWrapper v1.0.0',
    tags: ['category:wrapper', 'NameWrapper'],
    dependencies: [
      'StaticMetadataService',
      'ENSRegistry',
      'BaseRegistrarImplementation',
      'RegistrarSecurityController',
      'ReverseRegistrar', // due to ReverseClaimer
      'EthOwnedResolver',
    ],
  },
)
