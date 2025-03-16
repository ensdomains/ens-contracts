import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import hre from 'hardhat'
import { labelhash, namehash, zeroHash } from 'viem'
import { getReverseName } from '../fixtures/ensip19.js'

async function fixture() {
  const accounts = await hre.viem
    .getWalletClients()
    .then((clients) => clients.map((c) => c.account))

  const ensRegistry = await hre.viem.deployContract('ENSRegistry', [])
  const baseRegistrar = await hre.viem.deployContract(
    'BaseRegistrarImplementation',
    [ensRegistry.address, namehash('eth')],
  )

  await baseRegistrar.write.addController([accounts[0].address])
  await baseRegistrar.write.addController([accounts[1].address])

  const reverseRegistrar = await hre.viem.deployContract('ReverseRegistrar', [
    ensRegistry.address,
  ])

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

  const metadataService = await hre.viem.deployContract(
    'StaticMetadataService',
    ['https://ens.domains/'],
  )

  const nameWrapper = await hre.viem.deployContract('NameWrapper', [
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
    accounts,
  }
}

describe('ReverseClaimer', () => {
  it('claims a reverse node to the msg.sender of the deployer', async () => {
    const { ensRegistry, nameWrapper, accounts } = await loadFixture(fixture)

    await expect(
      ensRegistry.read.owner([namehash(getReverseName(nameWrapper.address))]),
    ).resolves.toEqualAddress(accounts[0].address)
  })

  it('claims a reverse node to an address specified by the deployer', async () => {
    const { ensRegistry, accounts } = await loadFixture(fixture)

    const mockReverseClaimerImplementer = await hre.viem.deployContract(
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
