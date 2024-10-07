import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import hre from 'hardhat'
import { getAddress, labelhash, namehash, zeroAddress, zeroHash } from 'viem'
import { dnsEncodeName } from '../fixtures/dnsEncodeName.js'

async function fixture() {
  const accounts = await hre.viem
    .getWalletClients()
    .then((clients) => clients.map((c) => c.account))
  const ensRegistry = await hre.viem.deployContract('ENSRegistry', [])
  const root = await hre.viem.deployContract('Root', [ensRegistry.address])
  const nameWrapper = await hre.viem.deployContract('DummyNameWrapper', [])
  const reverseRegistrar = await hre.viem.deployContract('ReverseRegistrar', [
    ensRegistry.address,
  ])

  await root.write.setController([accounts[0].address, true])
  await ensRegistry.write.setOwner([zeroHash, root.address])

  await root.write.setSubnodeOwner([labelhash('reverse'), accounts[0].address])
  await root.write.setSubnodeOwner([labelhash('eth'), accounts[0].address])
  await ensRegistry.write.setSubnodeOwner([
    namehash('reverse'),
    labelhash('addr'),
    reverseRegistrar.address,
  ])

  const publicResolver = await hre.viem.deployContract('PublicResolver', [
    ensRegistry.address,
    nameWrapper.address,
    zeroAddress,
    zeroAddress,
  ])
  const ensip10ResolverFinder = await hre.viem.deployContract(
    'DummyENSIP10ResolverFinderImplementer',
    [ensRegistry.address],
  )
  await ensRegistry.write.setSubnodeRecord([
    namehash('eth'),
    labelhash('test'),
    accounts[0].address,
    publicResolver.address,
    0n,
  ])
  await ensRegistry.write.setSubnodeRecord([
    namehash('test.eth'),
    labelhash('sub'),
    accounts[0].address,
    accounts[1].address,
    0n,
  ])

  return {
    ensRegistry,
    nameWrapper,
    publicResolver,
    ensip10ResolverFinder,
    accounts,
    root,
  }
}

describe('ENSIP10ResolverFinder', () => {
  describe('findResolver()', () => {
    it('should find an exact match resolver', async () => {
      const { ensip10ResolverFinder, publicResolver } = await loadFixture(
        fixture,
      )

      await expect(
        ensip10ResolverFinder.read.findResolver([dnsEncodeName('test.eth')]),
      ).resolves.toMatchObject([
        getAddress(publicResolver.address),
        namehash('test.eth'),
        0n,
      ])
    })

    it('should find a resolver on a parent name', async () => {
      const { ensip10ResolverFinder, publicResolver } = await loadFixture(
        fixture,
      )

      await expect(
        ensip10ResolverFinder.read.findResolver([
          dnsEncodeName('foo.test.eth'),
        ]),
      ).resolves.toMatchObject([
        getAddress(publicResolver.address),
        namehash('foo.test.eth'),
        4n,
      ])
    })

    it('should choose the resolver closest to the leaf', async () => {
      const { ensip10ResolverFinder, accounts } = await loadFixture(fixture)

      await expect(
        ensip10ResolverFinder.read.findResolver([
          dnsEncodeName('sub.test.eth'),
        ]),
      ).resolves.toMatchObject([
        getAddress(accounts[1].address),
        namehash('sub.test.eth'),
        0n,
      ])
    })

    it('should allow encoded labels', async () => {
      const { ensip10ResolverFinder, publicResolver } = await loadFixture(
        fixture,
      )

      await expect(
        ensip10ResolverFinder.read.findResolver([
          dnsEncodeName(
            '[9c22ff5f21f0b81b113e63f7db6da94fedef11b2119b4088b89664fb9a3cb658].eth',
          ),
        ]),
      ).resolves.toMatchObject([
        getAddress(publicResolver.address),
        namehash('test.eth'),
        0n,
      ])
    })
  })
})
