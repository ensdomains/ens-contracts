import type { DeployFunction } from 'hardhat-deploy/types.js'
import { namehash, zeroAddress } from 'viem'
import { getInterfaceId } from '../../test/fixtures/createInterfaceId.js'

const func: DeployFunction = async function (hre) {
  const { network, viem } = hre

  const { deployer, owner } = await viem.getNamedClients()

  const registry = await viem.getContract('ENSRegistry', owner)
  const registrar = await viem.getContract('BaseRegistrarImplementation', owner)
  const metadata = await viem.getContract('StaticMetadataService', owner)

  const nameWrapperDeployment = await viem.deploy('NameWrapper', [
    registry.address,
    registrar.address,
    metadata.address,
  ])
  if (!nameWrapperDeployment.newlyDeployed) return

  const nameWrapper = await viem.getContract('NameWrapper')

  if (owner.address !== deployer.address) {
    const hash = await nameWrapper.write.transferOwnership([owner.address])
    console.log(
      `Transferring ownership of NameWrapper to ${owner.address} (tx: ${hash})...`,
    )
    await viem.waitForTransactionSuccess(hash)
  }

  // Only attempt to make controller etc changes directly on testnets
  if (network.name === 'mainnet') return

  const addControllerHash = await registrar.write.addController([
    nameWrapper.address,
  ])
  console.log(
    `Adding NameWrapper as controller on registrar (tx: ${addControllerHash})...`,
  )
  await viem.waitForTransactionSuccess(addControllerHash)

  const interfaceId = await getInterfaceId('INameWrapper')
  const resolver = await registry.read.resolver([namehash('eth')])
  if (resolver === zeroAddress) {
    console.log(
      `No resolver set for .eth; not setting interface ${interfaceId} for NameWrapper`,
    )
    return
  }

  const resolverContract = await viem.getContractAt('OwnedResolver', resolver)
  const setInterfaceHash = await resolverContract.write.setInterface([
    namehash('eth'),
    interfaceId,
    nameWrapper.address,
  ])
  console.log(
    `Setting NameWrapper interface ID ${interfaceId} on .eth resolver (tx: ${setInterfaceHash})...`,
  )
  await viem.waitForTransactionSuccess(setInterfaceHash)
}

func.id = 'name-wrapper'
func.tags = ['wrapper', 'NameWrapper']
func.dependencies = [
  'StaticMetadataService',
  'registry',
  'ReverseRegistrar',
  'OwnedResolver',
]

export default func
