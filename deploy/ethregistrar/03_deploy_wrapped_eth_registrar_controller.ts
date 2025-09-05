import { artifacts, execute } from '@rocketh'
import type { Artifact } from 'rocketh'
import { namehash, zeroAddress, type Abi } from 'viem'
import wrappedEthRegistrarArtifactRaw from '../../deployments/mainnet/WrappedETHRegistrarController.json'

const wrappedEthRegistrarArtifact =
  wrappedEthRegistrarArtifactRaw as unknown as Artifact<Abi>

export default execute(
  async ({
    deploy,
    get,
    execute: write,
    read,
    namedAccounts,
    network,
    registerWrappedNames,
  }) => {
    const { deployer, owner } = namedAccounts

    const registry = get<(typeof artifacts.ENSRegistry)['abi']>('ENSRegistry')
    const registrar = get<
      (typeof artifacts.BaseRegistrarImplementation)['abi']
    >('BaseRegistrarImplementation')
    const priceOracle = get<
      (typeof artifacts.ExponentialPremiumPriceOracle)['abi']
    >('ExponentialPremiumPriceOracle')
    const reverseRegistrar =
      get<(typeof artifacts.ReverseRegistrar)['abi']>('ReverseRegistrar')
    const nameWrapper =
      get<(typeof artifacts.NameWrapper)['abi']>('NameWrapper')

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
    if (network.name === 'mainnet' && !network.tags?.tenderly) return

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
      `  - Adding WrappedETHRegistrarController as controller on BaseRegistrarImplementation`,
    )
    await write(registrar, {
      functionName: 'addController',
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
      { ...artifacts.OwnedResolver, address: resolver },
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
  },
  {
    id: 'ETHRegistrarController v2.0.0',
    tags: ['category:ethregistrar', 'WrappedETHRegistrarController'],
    dependencies: [
      'ENSRegistry',
      'BaseRegistrarImplementation',
      'ExponentialPremiumPriceOracle',
      'ReverseRegistrar',
      'NameWrapper',
      'OwnedResolver',
    ],
  },
)
