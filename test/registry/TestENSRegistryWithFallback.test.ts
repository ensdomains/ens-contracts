import hre from 'hardhat'
import { getAddress, labelhash, namehash, zeroHash } from 'viem'

import { getAccounts } from '../fixtures/utils.js'

const connection = await hre.network.connect()
const accounts = await getAccounts(connection)

async function fixture() {
  const oldEnsRegistry = await connection.viem.deployContract('ENSRegistry', [])
  const ensRegistry = await connection.viem.deployContract(
    'ENSRegistryWithFallback',
    [oldEnsRegistry.address],
  )

  return { oldEnsRegistry, ensRegistry }
}
const loadFixture = async () => connection.networkHelpers.loadFixture(fixture)

async function fixtureWithEthSet() {
  const existing = await loadFixture()
  await existing.oldEnsRegistry.write.setSubnodeOwner([
    zeroHash,
    labelhash('eth'),
    accounts[0].address,
  ])
  return existing
}
const loadFixtureWithEthSet = async () =>
  connection.networkHelpers.loadFixture(fixtureWithEthSet)

describe('ENSRegistryWithFallback', () => {
  it('should allow setting the record', async () => {
    const { ensRegistry } = await loadFixture()

    const tx = ensRegistry.write.setRecord([
      zeroHash,
      accounts[1].address,
      accounts[2].address,
      3600n,
    ])

    await expect(tx)
      .toEmitEvent('Transfer')
      .withArgs({ node: zeroHash, owner: getAddress(accounts[1].address) })
    await expect(tx)
      .toEmitEvent('NewResolver')
      .withArgs({ node: zeroHash, resolver: getAddress(accounts[2].address) })
    await expect(tx)
      .toEmitEvent('NewTTL')
      .withArgs({ node: zeroHash, ttl: 3600n })

    await expect(ensRegistry.read.owner([zeroHash])).resolves.toEqualAddress(
      accounts[1].address,
    )
    await expect(ensRegistry.read.resolver([zeroHash])).resolves.toEqualAddress(
      accounts[2].address,
    )
    await expect(ensRegistry.read.ttl([zeroHash])).resolves.toEqual(3600n)
  })

  it('should allow setting subnode records', async () => {
    const { ensRegistry } = await loadFixture()

    const tx = ensRegistry.write.setSubnodeRecord([
      zeroHash,
      labelhash('test'),
      accounts[1].address,
      accounts[2].address,
      3600n,
    ])
    const node = namehash('test')

    await expect(tx)
      .toEmitEvent('NewOwner')
      .withArgs({
        node: zeroHash,
        label: labelhash('test'),
        owner: getAddress(accounts[1].address),
      })
    await expect(tx)
      .toEmitEvent('NewResolver')
      .withArgs({ node, resolver: getAddress(accounts[2].address) })
    await expect(tx).toEmitEvent('NewTTL').withArgs({ node, ttl: 3600n })

    await expect(ensRegistry.read.owner([node])).resolves.toEqualAddress(
      accounts[1].address,
    )
    await expect(ensRegistry.read.resolver([node])).resolves.toEqualAddress(
      accounts[2].address,
    )
    await expect(ensRegistry.read.ttl([node])).resolves.toEqual(3600n)
  })

  it('should implement authorisations/operators', async () => {
    const { ensRegistry } = await loadFixture()

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
      const { oldEnsRegistry, ensRegistry } = await loadFixtureWithEthSet()

      await oldEnsRegistry.write.setTTL([node, 3600n])

      await expect(ensRegistry.read.ttl([node])).resolves.toEqual(3600n)
    })

    it('should use fallback owner if owner not set', async () => {
      const { ensRegistry } = await loadFixtureWithEthSet()

      await expect(ensRegistry.read.owner([node])).resolves.toEqualAddress(
        accounts[0].address,
      )
    })

    it('should use fallback resolver if owner not set', async () => {
      const { oldEnsRegistry, ensRegistry } = await loadFixtureWithEthSet()

      await oldEnsRegistry.write.setResolver([node, accounts[0].address])

      await expect(ensRegistry.read.resolver([node])).resolves.toEqualAddress(
        accounts[0].address,
      )
    })
  })
})
