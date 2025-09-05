import hre from 'hardhat'
import { labelhash, namehash, zeroHash } from 'viem'

import { getAccounts } from '../fixtures/utils.js'

const connection = await hre.network.connect()
const accounts = await getAccounts(connection)

async function fixture() {
  const ensRegistry = await connection.viem.deployContract('ENSRegistry', [])
  const fifsRegistrar = await connection.viem.deployContract('FIFSRegistrar', [
    ensRegistry.address,
    zeroHash,
  ])

  await ensRegistry.write.setOwner([zeroHash, fifsRegistrar.address])

  return { ensRegistry, fifsRegistrar }
}
const loadFixture = async () => connection.networkHelpers.loadFixture(fixture)

async function fixtureWithEthSet() {
  const existing = await loadFixture()
  await existing.fifsRegistrar.write.register([
    labelhash('eth'),
    accounts[0].address,
  ])
  return existing
}
const loadFixtureWithEthSet = async () =>
  connection.networkHelpers.loadFixture(fixtureWithEthSet)

describe('FIFSRegistrar', () => {
  it('should allow registration of names', async () => {
    const { ensRegistry, fifsRegistrar } = await loadFixture()

    await fifsRegistrar.write.register([labelhash('eth'), accounts[0].address])

    await expect(ensRegistry.read.owner([zeroHash])).resolves.toEqualAddress(
      fifsRegistrar.address,
    )
    await expect(
      ensRegistry.read.owner([namehash('eth')]),
    ).resolves.toEqualAddress(accounts[0].address)
  })

  describe('transferring names', () => {
    it('should allow transferring name to your own', async () => {
      const { fifsRegistrar, ensRegistry } = await loadFixtureWithEthSet()

      await fifsRegistrar.write.register([
        labelhash('eth'),
        accounts[1].address,
      ])

      await expect(
        ensRegistry.read.owner([namehash('eth')]),
      ).resolves.toEqualAddress(accounts[1].address)
    })

    it('forbids transferring the name you do not own', async () => {
      const { fifsRegistrar } = await loadFixtureWithEthSet()

      await expect(
        fifsRegistrar.write.register([labelhash('eth'), accounts[1].address], {
          account: accounts[1],
        }),
      ).toBeRevertedWithoutReason()
    })
  })
})
