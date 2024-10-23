import type { DeployFunction } from 'hardhat-deploy/types.js'
import { namehash, zeroAddress, type Address } from 'viem'
import { getInterfaceId } from '../../test/fixtures/createInterfaceId.js'

const func: DeployFunction = async function (hre) {
  const { network, viem } = hre

  const registry = await viem.getContract('ENSRegistry')
  const baseRegistrar = await viem.getContract('BaseRegistrarImplementation')
  const controller = await viem.getContract('ETHRegistrarController')

  const bulkRenewal = await viem.deploy('BulkRenewal', [
    baseRegistrar.address,
    controller.address,
  ])

  // Only attempt to make resolver etc changes directly on testnets
  if (network.name === 'mainnet') return

  const interfaceIds = [
    await getInterfaceId('IFixedDurationBulkRenewal'),
    await getInterfaceId('IFixedItemPriceBulkRenewal'),
    await getInterfaceId('ITargetExpiryBulkRenewal'),
  ]

  const resolver = await registry.read.resolver([namehash('eth')])
  if (resolver === zeroAddress) {
    console.log(
      `No resolver set for .eth; not setting interfaces for BulkRenewal`,
    )
    return
  }

  for (const interfaceId of interfaceIds) {
    const ethOwnedResolver = await viem.getContract('OwnedResolver')
    const setInterfaceHash = await ethOwnedResolver.write.setInterface([
      namehash('eth'),
      interfaceId,
      bulkRenewal.address as Address,
    ])
    console.log(
      `Setting BulkRenewal interface ID ${interfaceId} on .eth resolver (tx: ${setInterfaceHash})...`,
    )
    await viem.waitForTransactionSuccess(setInterfaceHash)
  }

  return true
}

func.id = 'bulk-renewal'
func.tags = ['BulkRenewal']
func.dependencies = [
  'ENSRegistry',
  'BaseRegistrarImplementation',
  'ETHRegistrarController',
]

export default func
