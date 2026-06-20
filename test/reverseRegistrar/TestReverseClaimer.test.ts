import hre from 'hardhat'
import { labelhash, namehash, zeroHash } from 'viem'

import { getReverseName } from '../fixtures/ensip19.js'
import { getAccounts } from '../fixtures/utils.js'

const connection = await hre.network.connect()
const accounts = await getAccounts(connection)

async function fixture() {
  const ensRegistry = await connection.viem.deployContract('ENSRegistry', [])

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

  return { ensRegistry, reverseRegistrar }
}
const loadFixture = async () => connection.networkHelpers.loadFixture(fixture)

describe('ReverseClaimer', () => {
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
