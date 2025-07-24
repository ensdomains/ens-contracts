import { execute, artifacts } from '@rocketh'
import { getAddress, namehash, zeroAddress, encodeFunctionData } from 'viem'
import { createInterfaceId } from '../../test/fixtures/createInterfaceId.js'

export default execute(
  async ({ deploy, get, tx, namedAccounts, network }) => {
    const { deployer, owner } = namedAccounts

    const registry = await get('ENSRegistry')
    const registrar = await get('BaseRegistrarImplementation')
    const priceOracle = await get('ExponentialPremiumPriceOracle')
    const reverseRegistrar = await get('ReverseRegistrar')
    const defaultReverseRegistrar = await get('DefaultReverseRegistrar')

    const controllerDeployment = await deploy('ETHRegistrarController', {
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

    if (!controllerDeployment.newlyDeployed) return

    const controller = await get('ETHRegistrarController')

    // Transfer ownership to owner
    if (owner !== deployer) {
      try {
        await tx({
          to: controller.address,
          data: encodeFunctionData({
            abi: controller.abi,
            functionName: 'transferOwnership',
            args: [owner],
          }),
          account: deployer,
        })
        console.log(
          `Transferred ownership of ETHRegistrarController to ${owner}`,
        )
      } catch (error) {
        console.log(
          'ETHRegistrarController ownership transfer error:',
          error.message,
        )
      }
    }

    // Only attempt to make controller etc changes directly on testnets
    if (network.name === 'mainnet' && !network.tags?.tenderly) return

    // Add controller to BaseRegistrarImplementation
    try {
      await tx({
        to: registrar.address,
        data: encodeFunctionData({
          abi: registrar.abi,
          functionName: 'addController',
          args: [controller.address],
        }),
        account: owner,
      })
      console.log(
        'Added ETHRegistrarController as controller on BaseRegistrarImplementation',
      )
    } catch (error) {
      console.log(
        'ETHRegistrarController registrar controller setup error:',
        error.message,
      )
    }

    // Add controller to ReverseRegistrar
    try {
      await tx({
        to: reverseRegistrar.address,
        data: encodeFunctionData({
          abi: reverseRegistrar.abi,
          functionName: 'setController',
          args: [controller.address, true],
        }),
        account: owner,
      })
      console.log(
        'Added ETHRegistrarController as controller on ReverseRegistrar',
      )
    } catch (error) {
      console.log(
        'ETHRegistrarController reverse registrar controller setup error:',
        error.message,
      )
    }

    // Add controller to DefaultReverseRegistrar
    try {
      await tx({
        to: defaultReverseRegistrar.address,
        data: encodeFunctionData({
          abi: defaultReverseRegistrar.abi,
          functionName: 'setController',
          args: [controller.address, true],
        }),
        account: owner,
      })
      console.log(
        'Added ETHRegistrarController as controller on DefaultReverseRegistrar',
      )
    } catch (error) {
      console.log(
        'ETHRegistrarController default reverse registrar controller setup error:',
        error.message,
      )
    }

    // Set interface on resolver
    try {
      const artifact = artifacts.IETHRegistrarController
      const interfaceId = createInterfaceId(artifact.abi)

      // For simplicity, assume OwnedResolver was deployed for .eth
      const ethOwnedResolver = await get('OwnedResolver')

      await tx({
        to: ethOwnedResolver.address,
        data: encodeFunctionData({
          abi: ethOwnedResolver.abi,
          functionName: 'setInterface',
          args: [namehash('eth'), interfaceId, controller.address],
        }),
        account: owner,
      })
      console.log(
        `Set ETHRegistrarController interface ID ${interfaceId} on .eth resolver`,
      )
    } catch (error) {
      console.log(
        'ETHRegistrarController interface setup error:',
        error.message,
      )
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
