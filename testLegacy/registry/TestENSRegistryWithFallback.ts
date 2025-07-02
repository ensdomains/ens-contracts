import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import hre from 'hardhat'
import { labelhash, namehash, zeroHash } from 'viem'

async function fixture() {
  const accounts = await hre.viem
    .getWalletClients()
    .then((clients) => clients.map((c) => c.account))
  const oldEnsRegistry = await hre.viem.deployContract('ENSRegistry', [])
  const ensRegistry = await hre.viem.deployContract('ENSRegistryWithFallback', [
    oldEnsRegistry.address,
  ])

  return { oldEnsRegistry, ensRegistry, accounts }
}

async function fixtureWithEthSet() {
  const existing = await loadFixture(fixture)
  await existing.oldEnsRegistry.write.setSubnodeOwner([
    zeroHash,
    labelhash('eth'),
    existing.accounts[0].address,
  ])
  return existing
}

describe('ENSRegistryWithFallback', () => {
  it('should allow setting the record', async () => {
    const { ensRegistry, accounts } = await loadFixture(fixture)

    const hash = await ensRegistry.write.setRecord([
      zeroHash,
      accounts[1].address,
      accounts[2].address,
      3600n,
    ])

    await expect(ensRegistry)
      .transaction(hash)
      .toEmitEvent('Transfer')
      .withArgs(zeroHash, accounts[1].address)
    await expect(ensRegistry)
      .transaction(hash)
      .toEmitEvent('NewResolver')
      .withArgs(zeroHash, accounts[2].address)
    await expect(ensRegistry)
      .transaction(hash)
      .toEmitEvent('NewTTL')
      .withArgs(zeroHash, 3600n)

    await expect(ensRegistry.read.owner([zeroHash])).resolves.toEqualAddress(
      accounts[1].address,
    )
    await expect(ensRegistry.read.resolver([zeroHash])).resolves.toEqualAddress(
      accounts[2].address,
    )
    await expect(ensRegistry.read.ttl([zeroHash])).resolves.toEqual(3600n)
  })

  it('should allow setting subnode records', async () => {
    const { ensRegistry, accounts } = await loadFixture(fixture)

    const hash = await ensRegistry.write.setSubnodeRecord([
      zeroHash,
      labelhash('test'),
      accounts[1].address,
      accounts[2].address,
      3600n,
    ])
    const node = namehash('test')

    await expect(ensRegistry)
      .transaction(hash)
      .toEmitEvent('NewOwner')
      .withArgs(zeroHash, labelhash('test'), accounts[1].address)
    await expect(ensRegistry)
      .transaction(hash)
      .toEmitEvent('NewResolver')
      .withArgs(node, accounts[2].address)
    await expect(ensRegistry)
      .transaction(hash)
      .toEmitEvent('NewTTL')
      .withArgs(node, 3600n)

    await expect(ensRegistry.read.owner([node])).resolves.toEqualAddress(
      accounts[1].address,
    )
    await expect(ensRegistry.read.resolver([node])).resolves.toEqualAddress(
      accounts[2].address,
    )
    await expect(ensRegistry.read.ttl([node])).resolves.toEqual(3600n)
  })

  it('should implement authorisations/operators', async () => {
    const { ensRegistry, accounts } = await loadFixture(fixture)

    await ensRegistry.write.setApprovalForAll([accounts[1].address, true])
    await ensRegistry.write.setOwner([zeroHash, accounts[2].address], {
      account: accounts[1],
    })

    await expect(ensRegistry.read.owner([zeroHash])).resolves.toEqualAddress(
      accounts[2].address,
    )
  })

  describe('fallback', () => {
    const node = namehash('eth')

    it('should use fallback ttl if owner is not set', async () => {
      const { oldEnsRegistry, ensRegistry } = await loadFixture(
        fixtureWithEthSet,
      )

      await oldEnsRegistry.write.setTTL([node, 3600n])

      await expect(ensRegistry.read.ttl([node])).resolves.toEqual(3600n)
    })

    it('should use fallback owner if owner not set', async () => {
      const { ensRegistry, accounts } = await loadFixture(fixtureWithEthSet)

      await expect(ensRegistry.read.owner([node])).resolves.toEqualAddress(
        accounts[0].address,
      )
    })

    it('should use fallback resolver if owner not set', async () => {
      const { oldEnsRegistry, ensRegistry, accounts } = await loadFixture(
        fixtureWithEthSet,
      )

      await oldEnsRegistry.write.setResolver([node, accounts[0].address])

      await expect(ensRegistry.read.resolver([node])).resolves.toEqualAddress(
        accounts[0].address,
      )
    })
  })
})
