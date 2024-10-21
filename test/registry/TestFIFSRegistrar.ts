import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import hre from 'hardhat'
import { labelhash, namehash, zeroHash } from 'viem'

async function fixture() {
  const accounts = await hre.viem
    .getWalletClients()
    .then((clients) => clients.map((c) => c.account))
  const ensRegistry = await hre.viem.deployContract('ENSRegistry', [])
  const fifsRegistrar = await hre.viem.deployContract('FIFSRegistrar', [
    ensRegistry.address,
    zeroHash,
  ])

  await ensRegistry.write.setOwner([zeroHash, fifsRegistrar.address])

  return { ensRegistry, fifsRegistrar, accounts }
}

async function fixtureWithEthSet() {
  const existing = await loadFixture(fixture)
  await existing.fifsRegistrar.write.register([
    labelhash('eth'),
    existing.accounts[0].address,
  ])
  return existing
}

describe('FIFSRegistrar', () => {
  it('should allow registration of names', async () => {
    const { ensRegistry, fifsRegistrar, accounts } = await loadFixture(fixture)

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
      const { fifsRegistrar, ensRegistry, accounts } = await loadFixture(
        fixtureWithEthSet,
      )

      await fifsRegistrar.write.register([
        labelhash('eth'),
        accounts[1].address,
      ])

      await expect(
        ensRegistry.read.owner([namehash('eth')]),
      ).resolves.toEqualAddress(accounts[1].address)
    })

    it('forbids transferring the name you do not own', async () => {
      const { fifsRegistrar, accounts } = await loadFixture(fixtureWithEthSet)

      await expect(fifsRegistrar)
        .write('register', [labelhash('eth'), accounts[1].address], {
          account: accounts[1],
        })
        .toBeRevertedWithoutReason()
    })
  })
})
