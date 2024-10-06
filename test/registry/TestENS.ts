import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import hre from 'hardhat'
import { labelhash, namehash, padHex, zeroHash } from 'viem'

const placeholderAddr = padHex('0x1234', { size: 20 })

async function fixture() {
  const accounts = await hre.viem
    .getWalletClients()
    .then((clients) => clients.map((c) => c.account))
  const ensRegistry = await hre.viem.deployContract('ENSRegistry', [])

  return { ensRegistry, accounts }
}

describe('ENSRegistry', () => {
  it('should allow ownership transfers', async () => {
    const { ensRegistry } = await loadFixture(fixture)

    await expect(ensRegistry)
      .write('setOwner', [zeroHash, placeholderAddr])
      .toEmitEvent('Transfer')
      .withArgs(zeroHash, placeholderAddr)

    await expect(ensRegistry.read.owner([zeroHash])).resolves.toEqual(
      placeholderAddr,
    )
  })

  it('should prohibit transfers by non-owners', async () => {
    const { ensRegistry } = await loadFixture(fixture)

    await expect(ensRegistry)
      .write('setOwner', [padHex('0x01', { size: 32 }), placeholderAddr])
      .toBeRevertedWithoutReason()
  })

  it('should allow setting resolvers', async () => {
    const { ensRegistry } = await loadFixture(fixture)

    await expect(ensRegistry)
      .write('setResolver', [zeroHash, placeholderAddr])
      .toEmitEvent('NewResolver')
      .withArgs(zeroHash, placeholderAddr)

    await expect(ensRegistry.read.resolver([zeroHash])).resolves.toEqual(
      placeholderAddr,
    )
  })

  it('should prevent setting resolvers by non-owners', async () => {
    const { ensRegistry } = await loadFixture(fixture)

    await expect(ensRegistry)
      .write('setResolver', [padHex('0x01', { size: 32 }), placeholderAddr])
      .toBeRevertedWithoutReason()
  })

  it('should allow setting the TTL', async () => {
    const { ensRegistry } = await loadFixture(fixture)

    await expect(ensRegistry)
      .write('setTTL', [zeroHash, 3600n])
      .toEmitEvent('NewTTL')
      .withArgs(zeroHash, 3600n)

    await expect(ensRegistry.read.ttl([zeroHash])).resolves.toEqual(3600n)
  })

  it('should prevent setting the TTL by non-owners', async () => {
    const { ensRegistry } = await loadFixture(fixture)

    await expect(ensRegistry)
      .write('setTTL', [padHex('0x01', { size: 32 }), 3600n])
      .toBeRevertedWithoutReason()
  })

  it('should allow the creation of subnodes', async () => {
    const { ensRegistry, accounts } = await loadFixture(fixture)

    await expect(ensRegistry)
      .write('setSubnodeOwner', [
        zeroHash,
        labelhash('eth'),
        accounts[1].address,
      ])
      .toEmitEvent('NewOwner')
      .withArgs(zeroHash, labelhash('eth'), accounts[1].address)

    await expect(
      ensRegistry.read.owner([namehash('eth')]),
    ).resolves.toEqualAddress(accounts[1].address)
  })

  it('should prohibit subnode creation by non-owners', async () => {
    const { ensRegistry, accounts } = await loadFixture(fixture)

    await expect(ensRegistry)
      .write(
        'setSubnodeOwner',
        [zeroHash, labelhash('eth'), accounts[1].address],
        { account: accounts[1] },
      )
      .toBeRevertedWithoutReason()
  })
})
