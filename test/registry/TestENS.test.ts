import hre from 'hardhat'
import { getAddress, labelhash, namehash, padHex, zeroHash } from 'viem'

import { getAccounts } from '../fixtures/utils.js'

const placeholderAddr = padHex('0x1234', { size: 20 })

const connection = await hre.network.connect()
const accounts = await getAccounts(connection)

async function fixture() {
  const ensRegistry = await connection.viem.deployContract('ENSRegistry', [])

  return { ensRegistry }
}
const loadFixture = async () => connection.networkHelpers.loadFixture(fixture)

describe('ENSRegistry', () => {
  it('should allow ownership transfers', async () => {
    const { ensRegistry } = await loadFixture()

    await expect(ensRegistry.write.setOwner([zeroHash, placeholderAddr]))
      .toEmitEvent('Transfer')
      .withArgs({ node: zeroHash, owner: placeholderAddr })

    await expect(ensRegistry.read.owner([zeroHash])).resolves.toEqual(
      placeholderAddr,
    )
  })

  it('should prohibit transfers by non-owners', async () => {
    const { ensRegistry } = await loadFixture()

    await expect(
      ensRegistry.write.setOwner([
        padHex('0x01', { size: 32 }),
        placeholderAddr,
      ]),
    ).toBeRevertedWithoutReason()
  })

  it('should allow setting resolvers', async () => {
    const { ensRegistry } = await loadFixture()

    await expect(ensRegistry.write.setResolver([zeroHash, placeholderAddr]))
      .toEmitEvent('NewResolver')
      .withArgs({ node: zeroHash, resolver: placeholderAddr })

    await expect(ensRegistry.read.resolver([zeroHash])).resolves.toEqual(
      placeholderAddr,
    )
  })

  it('should prevent setting resolvers by non-owners', async () => {
    const { ensRegistry } = await loadFixture()

    await expect(
      ensRegistry.write.setResolver([
        padHex('0x01', { size: 32 }),
        placeholderAddr,
      ]),
    ).toBeRevertedWithoutReason()
  })

  it('should allow setting the TTL', async () => {
    const { ensRegistry } = await loadFixture()

    await expect(ensRegistry.write.setTTL([zeroHash, 3600n]))
      .toEmitEvent('NewTTL')
      .withArgs({ node: zeroHash, ttl: 3600n })

    await expect(ensRegistry.read.ttl([zeroHash])).resolves.toEqual(3600n)
  })

  it('should prevent setting the TTL by non-owners', async () => {
    const { ensRegistry } = await loadFixture()

    await expect(
      ensRegistry.write.setTTL([padHex('0x01', { size: 32 }), 3600n]),
    ).toBeRevertedWithoutReason()
  })

  it('should allow the creation of subnodes', async () => {
    const { ensRegistry } = await loadFixture()

    await expect(
      ensRegistry.write.setSubnodeOwner([
        zeroHash,
        labelhash('eth'),
        accounts[1].address,
      ]),
    )
      .toEmitEvent('NewOwner')
      .withArgs({
        node: zeroHash,
        label: labelhash('eth'),
        owner: getAddress(accounts[1].address),
      })

    await expect(
      ensRegistry.read.owner([namehash('eth')]),
    ).resolves.toEqualAddress(accounts[1].address)
  })

  it('should prohibit subnode creation by non-owners', async () => {
    const { ensRegistry } = await loadFixture()

    await expect(
      ensRegistry.write.setSubnodeOwner(
        [zeroHash, labelhash('eth'), accounts[1].address],
        { account: accounts[1] },
      ),
    ).toBeRevertedWithoutReason()
  })
})
