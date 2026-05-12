import hre from 'hardhat'
import { labelhash, namehash, zeroHash } from 'viem'

import { getReverseName } from '../fixtures/ensip19.js'
import { getAccounts } from '../fixtures/utils.js'

const connection = await hre.network.connect()
const accounts = await getAccounts(connection)

async function fixture() {
  const ensRegistry = await connection.viem.deployContract('ENSRegistry', [])
  const baseRegistrar = await connection.viem.deployContract(
    'BaseRegistrarImplementation',
    [ensRegistry.address, namehash('eth')],
  )

  await baseRegistrar.write.addController([accounts[0].address])
  await baseRegistrar.write.addController([accounts[1].address])

  const reverseRegistrar = await connection.viem.deployContract(
    'ReverseRegistrar',
    [ensRegistry.address],
  )

  await ensRegistry.write.setSubnodeOwner([
    zeroHash,
    labelhash('reverse'),
    accounts[0].address,
  ])
  await ensRegistry.write.setSubnodeOwner([
    namehash('reverse'),
    labelhash('addr'),
    reverseRegistrar.address,
  ])

  const metadataService = await connection.viem.deployContract(
    'StaticMetadataService',
    ['https://ens.domains/'],
  )

  const nameWrapper = await connection.viem.deployContract('NameWrapper', [
    ensRegistry.address,
    baseRegistrar.address,
    metadataService.address,
  ])

  return {
    ensRegistry,
    baseRegistrar,
    reverseRegistrar,
    metadataService,
    nameWrapper,
  }
}
const loadFixture = async () => connection.networkHelpers.loadFixture(fixture)

describe('ReverseClaimer', () => {
  it('claims a reverse node to the msg.sender of the deployer', async () => {
    const { ensRegistry, nameWrapper } = await loadFixture()

    await expect(
      ensRegistry.read.owner([namehash(getReverseName(nameWrapper.address))]),
    ).resolves.toEqualAddress(accounts[0].address)
  })

  it('claims a reverse node to an address specified by the deployer', async () => {
    const { ensRegistry } = await loadFixture()

    const mockReverseClaimerImplementer = await connection.viem.deployContract(
      'MockReverseClaimerImplementer',
      [ensRegistry.address, accounts[1].address],
    )

    await expect(
      ensRegistry.read.owner([
        namehash(getReverseName(mockReverseClaimerImplementer.address)),
      ]),
    ).resolves.toEqualAddress(accounts[1].address)
  })
})
