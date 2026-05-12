import hre from 'hardhat'
import { labelhash, namehash, zeroHash } from 'viem'

import { getAccounts } from '../fixtures/utils.js'

const connection = await hre.network.connect()
const accounts = await getAccounts(connection)

async function fixture() {
  const ensRegistry = await connection.viem.deployContract('ENSRegistry', [])
  const testRegistrar = await connection.viem.deployContract('TestRegistrar', [
    ensRegistry.address,
    zeroHash,
  ])

  await ensRegistry.write.setOwner([zeroHash, testRegistrar.address])

  return { ensRegistry, testRegistrar }
}
const loadFixture = async () => connection.networkHelpers.loadFixture(fixture)

describe('TestRegistrar', () => {
  it('registers names', async () => {
    const { ensRegistry, testRegistrar } = await loadFixture()

    await testRegistrar.write.register([labelhash('eth'), accounts[0].address])

    await expect(ensRegistry.read.owner([zeroHash])).resolves.toEqualAddress(
      testRegistrar.address,
    )
    await expect(
      ensRegistry.read.owner([namehash('eth')]),
    ).resolves.toEqualAddress(accounts[0].address)
  })

  it('forbids transferring names within the test period', async () => {
    const { testRegistrar } = await loadFixture()

    await testRegistrar.write.register([labelhash('eth'), accounts[1].address])

    await expect(
      testRegistrar.write.register([labelhash('eth'), accounts[0].address]),
    ).toBeRevertedWithoutReason()
  })

  it('allows claiming a name after the test period expires', async () => {
    const { ensRegistry, testRegistrar } = await loadFixture()
    const testClient = await connection.viem.getTestClient()

    await testRegistrar.write.register([labelhash('eth'), accounts[1].address])
    await expect(
      ensRegistry.read.owner([namehash('eth')]),
    ).resolves.toEqualAddress(accounts[1].address)

    await testClient.increaseTime({ seconds: 28 * 24 * 60 * 60 + 1 })

    await testRegistrar.write.register([labelhash('eth'), accounts[0].address])
    await expect(
      ensRegistry.read.owner([namehash('eth')]),
    ).resolves.toEqualAddress(accounts[0].address)
  })
})
