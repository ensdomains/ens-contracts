import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import hre from 'hardhat'
import { labelhash, namehash, zeroHash } from 'viem'

async function fixture() {
  const accounts = await hre.viem
    .getWalletClients()
    .then((clients) => clients.map((c) => c.account))
  const ensRegistry = await hre.viem.deployContract('ENSRegistry', [])
  const testRegistrar = await hre.viem.deployContract('TestRegistrar', [
    ensRegistry.address,
    zeroHash,
  ])

  await ensRegistry.write.setOwner([zeroHash, testRegistrar.address])

  return { ensRegistry, testRegistrar, accounts }
}

describe('TestRegistrar', () => {
  it('registers names', async () => {
    const { ensRegistry, testRegistrar, accounts } = await loadFixture(fixture)

    await testRegistrar.write.register([labelhash('eth'), accounts[0].address])

    await expect(ensRegistry.read.owner([zeroHash])).resolves.toEqualAddress(
      testRegistrar.address,
    )
    await expect(
      ensRegistry.read.owner([namehash('eth')]),
    ).resolves.toEqualAddress(accounts[0].address)
  })

  it('forbids transferring names within the test period', async () => {
    const { testRegistrar, accounts } = await loadFixture(fixture)

    await testRegistrar.write.register([labelhash('eth'), accounts[1].address])

    await expect(testRegistrar)
      .write('register', [labelhash('eth'), accounts[0].address])
      .toBeRevertedWithoutReason()
  })

  it('allows claiming a name after the test period expires', async () => {
    const { ensRegistry, testRegistrar, accounts } = await loadFixture(fixture)
    const testClient = await hre.viem.getTestClient()

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
