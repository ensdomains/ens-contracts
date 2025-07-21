import { execute, artifacts } from '@rocketh'
import { getAddress, namehash, zeroAddress } from 'viem'
import { createInterfaceId } from '../../test/fixtures/createInterfaceId.js'

export default execute(
  async ({ deploy, get, namedAccounts, network, viem }) => {
    const { deployer, owner } = namedAccounts

    const registry = await get('ENSRegistry')
    const registrar = await get('BaseRegistrarImplementation')
    const priceOracle = await get('ExponentialPremiumPriceOracle')
    const reverseRegistrar = await get('ReverseRegistrar')
    const defaultReverseRegistrar = await get('DefaultReverseRegistrar')

    await deploy('ETHRegistrarController', {
      account: deployer,
      artifact: artifacts.ETHRegistrarController,
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

    const controller = await get('ETHRegistrarController')

    // Transfer ownership to owner
    // Note: using 'as any' because rocketh's dynamic proxy doesn't have full type safety
    const controllerOwner = await (controller as any).read.owner()
    if (controllerOwner !== owner.address) {
      const hash = await (controller as any).write.transferOwnership(
        [owner.address],
        {
          account: deployer,
        },
      )
      console.log(
        `Transferring ownership of ETHRegistrarController to ${owner.address} (tx: ${hash})...`,
      )
      await viem.waitForTransactionSuccess(hash)
    }

    // Only attempt to make controller etc changes directly on testnets
    if (network.name === 'mainnet' && !network.tags?.tenderly) return

    // Add controller to BaseRegistrarImplementation
    const isRegistrarController = await (registrar as any).read.controllers([
      controller.address,
    ])
    if (!isRegistrarController) {
      const registrarAddControllerHash = await (
        registrar as any
      ).write.addController([controller.address], {
        account: owner,
      })
      console.log(
        `Adding ETHRegistrarController as a controller of BaseRegistrarImplementation (tx: ${registrarAddControllerHash})...`,
      )
      await viem.waitForTransactionSuccess(registrarAddControllerHash)
    }

    // Add controller to ReverseRegistrar
    const isReverseRegistrarController = await (
      reverseRegistrar as any
    ).read.controllers([controller.address])
    if (!isReverseRegistrarController) {
      const reverseRegistrarSetControllerHash = await (
        reverseRegistrar as any
      ).write.setController([controller.address, true], {
        account: owner,
      })
      console.log(
        `Adding ETHRegistrarController as a controller of ReverseRegistrar (tx: ${reverseRegistrarSetControllerHash})...`,
      )
      await viem.waitForTransactionSuccess(reverseRegistrarSetControllerHash)
    }

    // Add controller to DefaultReverseRegistrar
    const isDefaultReverseRegistrarController = await (
      defaultReverseRegistrar as any
    ).read.controllers([controller.address])
    if (!isDefaultReverseRegistrarController) {
      const defaultReverseRegistrarSetControllerHash = await (
        defaultReverseRegistrar as any
      ).write.setController([controller.address, true], {
        account: owner,
      })
      console.log(
        `Adding ETHRegistrarController as a controller of DefaultReverseRegistrar (tx: ${defaultReverseRegistrarSetControllerHash})...`,
      )
      await viem.waitForTransactionSuccess(
        defaultReverseRegistrarSetControllerHash,
      )
    }

    // Set interface on resolver
    const artifact = artifacts.IETHRegistrarController
    const interfaceId = createInterfaceId(artifact.abi)

    const resolver = await (registry as any).read.resolver([namehash('eth')])
    if (resolver === zeroAddress) {
      console.log(
        `No resolver set for .eth; not setting interface ${interfaceId} for ETH Registrar Controller`,
      )
      return
    }

    const ethOwnedResolver = await viem.getContractAt(
      'OwnedResolver',
      resolver,
      {
        client: owner,
      },
    )
    const hasInterfaceSet = await ethOwnedResolver.read
      .interfaceImplementer([namehash('eth'), interfaceId])
      .then((v: any) => getAddress(v) === getAddress(controller.address))
    if (!hasInterfaceSet) {
      const setInterfaceHash = await ethOwnedResolver.write.setInterface([
        namehash('eth'),
        interfaceId,
        controller.address,
      ])
      console.log(
        `Setting ETHRegistrarController interface ID ${interfaceId} on .eth resolver (tx: ${setInterfaceHash})...`,
      )
      await viem.waitForTransactionSuccess(setInterfaceHash)
    }
  },
  {
    id: 'ETHRegistrarController v3.0.0',
    tags: ['category:ethregistrar', 'ETHRegistrarController'],
    dependencies: [
      'ENSRegistry',
      'BaseRegistrarImplementation',
      'ExponentialPremiumPriceOracle',
      'ReverseRegistrar',
      'DefaultReverseRegistrar',
      'NameWrapper',
      'OwnedResolver',
    ],
  },
)
