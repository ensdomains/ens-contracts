import { artifacts, deployScript } from '@rocketh'
import { encodeFunctionData, namehash, zeroAddress, type Address } from 'viem'
import { createInterfaceId } from '../../test/fixtures/createInterfaceId.js'

export default deployScript(
  async ({ deploy, get, read, execute: write, tx, namedAccounts, network }) => {
    const { deployer, owner } = namedAccounts

    // Get dependencies
    const registry = get<(typeof artifacts.ENSRegistry)['abi']>('ENSRegistry')
    const registrar = get<
      (typeof artifacts.BaseRegistrarImplementation)['abi']
    >('BaseRegistrarImplementation')
    const registrarSecurityController = get<
      (typeof artifacts.RegistrarSecurityController)['abi']
    >('RegistrarSecurityController')
    const metadata = get<(typeof artifacts.StaticMetadataService)['abi']>(
      'StaticMetadataService',
    )

    // Deploy NameWrapper
    const nameWrapper = await deploy('NameWrapper', {
      account: deployer,
      artifact: artifacts.NameWrapper,
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
    if (network.name === 'mainnet' && !network.tags?.tenderly) return

    console.log(
      `  - Adding NameWrapper as controller via RegistrarSecurityController`,
    )
    await write(registrarSecurityController, {
      functionName: 'addRegistrarController',
      args: [nameWrapper.address],
      account: owner,
    })

    // Set NameWrapper interface on resolver
    const artifact = artifacts.INameWrapper
    const interfaceId = createInterfaceId(artifact.abi)

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
      get<(typeof artifacts.OwnedResolver)['abi']>('OwnedResolver')
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
      'OwnedResolver',
    ],
  },
)
