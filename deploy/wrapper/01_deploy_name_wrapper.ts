import { execute, artifacts } from '@rocketh'
import { namehash, zeroAddress, encodeFunctionData } from 'viem'
import { createInterfaceId } from '../../test/fixtures/createInterfaceId.js'

export default execute(
  async ({ deploy, get, read, tx, namedAccounts, network }) => {
    const { deployer, owner } = namedAccounts

    // Get dependencies
    const registry = await get('ENSRegistry')
    const registrar = await get('BaseRegistrarImplementation')
    const metadata = await get('StaticMetadataService')
    const reverseRegistrar = await get('ReverseRegistrar')

    // NameWrapper extends ReverseClaimer which requires proper reverse registrar setup
    console.log('Deploying NameWrapper...')
    console.log(`Using ReverseRegistrar at: ${reverseRegistrar.address}`)

    // Deploy NameWrapper
    const nameWrapperDeployment = await deploy('NameWrapper', {
      account: deployer,
      artifact: artifacts.NameWrapper,
      args: [registry.address, registrar.address, metadata.address],
    })

    if (!nameWrapperDeployment.newlyDeployed) return

    const nameWrapper = await get('NameWrapper')

    // Transfer ownership to owner
    if (owner !== deployer) {
      try {
        await tx({
          to: nameWrapper.address,
          data: encodeFunctionData({
            abi: nameWrapper.abi,
            functionName: 'transferOwnership',
            args: [owner],
          }),
          account: deployer,
        })
        console.log(`Transferred ownership of NameWrapper to ${owner}`)
      } catch (error) {
        console.log('NameWrapper ownership transfer error:', error.message)
      }
    }

    // Only attempt to make controller etc changes directly on testnets
    if (network.name === 'mainnet' && !network.tags?.tenderly) return

    try {
      // Add NameWrapper as controller on registrar
      await tx({
        to: registrar.address,
        data: encodeFunctionData({
          abi: registrar.abi,
          functionName: 'addController',
          args: [nameWrapper.address],
        }),
        account: owner,
      })
      console.log('Added NameWrapper as controller on registrar')
    } catch (error) {
      console.log('NameWrapper controller setup error:', error.message)
    }

    // Set NameWrapper interface on resolver
    const artifact = artifacts.INameWrapper
    const interfaceId = createInterfaceId(artifact.abi)

    const resolver = await read(registry, {
      functionName: 'resolver',
      args: [namehash('eth')],
    })

    if (resolver === zeroAddress) {
      console.log(
        `No resolver set for .eth; not setting interface ${interfaceId} for NameWrapper`,
      )
      return
    }

    // Set interface on the resolver configured for .eth
    const ownedResolver = await get('OwnedResolver')
    const setInterfaceHash = await tx({
      to: resolver,
      data: encodeFunctionData({
        abi: ownedResolver.abi,
        functionName: 'setInterface',
        args: [namehash('eth'), interfaceId, nameWrapper.address],
      }),
      account: owner,
    })
    console.log(
      `Setting NameWrapper interface ID ${interfaceId} on .eth resolver (tx: ${setInterfaceHash})...`,
    )

    return true
  },
  {
    id: 'NameWrapper v1.0.0',
    tags: ['category:wrapper', 'NameWrapper'],
    dependencies: [
      'StaticMetadataService',
      'ENSRegistry',
      'BaseRegistrarImplementation',
      'OwnedResolver',
    ],
  },
)
