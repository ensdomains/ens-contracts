import { execute, artifacts } from '@rocketh'
import { namehash, zeroAddress } from 'viem'
import { createInterfaceId } from '../../test/fixtures/createInterfaceId.js'

export default execute(
  async ({ deploy, get, namedAccounts, network, viem }) => {
    const { deployer, owner } = namedAccounts

    // Get dependencies
    const registry = await get('ENSRegistry')
    const registrar = await get('BaseRegistrarImplementation')
    const metadata = await get('StaticMetadataService')

    // Deploy NameWrapper
    const nameWrapperDeployment = await deploy('NameWrapper', {
      account: deployer,
      artifact: artifacts.NameWrapper,
      args: [registry.address, registrar.address, metadata.address],
    })

    if (!nameWrapperDeployment.newlyDeployed) return

    const nameWrapper = await get('NameWrapper')

    // Transfer ownership to owner
    // Note: using 'as any' because rocketh's dynamic proxy doesn't have full type safety
    if (owner.address !== deployer.address) {
      const hash = await (nameWrapper as any).write.transferOwnership(
        [owner.address],
        {
          account: deployer,
        },
      )
      console.log(
        `Transferring ownership of NameWrapper to ${owner.address} (tx: ${hash})...`,
      )
      await viem.waitForTransactionSuccess(hash)
    }

    // Only attempt to make controller etc changes directly on testnets
    if (network.name === 'mainnet' && !network.tags?.tenderly) return

    // Add NameWrapper as controller on registrar
    const addControllerHash = await (registrar as any).write.addController(
      [nameWrapper.address],
      {
        account: owner,
      },
    )
    console.log(
      `Adding NameWrapper as controller on registrar (tx: ${addControllerHash})...`,
    )
    await viem.waitForTransactionSuccess(addControllerHash)

    // Set interface on resolver
    const artifact = artifacts.INameWrapper
    const interfaceId = createInterfaceId(artifact.abi)
    const resolver = await (registry as any).read.resolver([namehash('eth')])
    if (resolver === zeroAddress) {
      console.log(
        `No resolver set for .eth; not setting interface ${interfaceId} for NameWrapper`,
      )
      return
    }

    const resolverContract = await viem.getContractAt(
      'OwnedResolver',
      resolver,
      {
        client: owner,
      },
    )
    const setInterfaceHash = await resolverContract.write.setInterface([
      namehash('eth'),
      interfaceId,
      nameWrapper.address,
    ])
    console.log(
      `Setting NameWrapper interface ID ${interfaceId} on .eth resolver (tx: ${setInterfaceHash})...`,
    )
    await viem.waitForTransactionSuccess(setInterfaceHash)
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
