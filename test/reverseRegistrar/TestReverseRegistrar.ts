import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import hre from 'hardhat'
import { type Address, labelhash, namehash, zeroAddress, zeroHash } from 'viem'
import { getReverseName } from '../fixtures/ensip19.js'

function getReverseNodeHash(addr: Address) {
  return namehash(getReverseName(addr))
}

async function fixture() {
  const accounts = await hre.viem
    .getWalletClients()
    .then((clients) => clients.map((c) => c.account))
  const ensRegistry = await hre.viem.deployContract('ENSRegistry', [])
  const nameWrapper = await hre.viem.deployContract('DummyNameWrapper', [])

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

  const publicResolver = await hre.viem.deployContract('PublicResolver', [
    ensRegistry.address,
    nameWrapper.address,
    zeroAddress,
    reverseRegistrar.address,
  ])

  await reverseRegistrar.write.setDefaultResolver([publicResolver.address])

  const dummyOwnable = await hre.viem.deployContract('ReverseRegistrar', [
    ensRegistry.address,
  ])

  return {
    ensRegistry,
    nameWrapper,
    reverseRegistrar,
    publicResolver,
    dummyOwnable,
    accounts,
  }
}

describe('ReverseRegistrar', () => {
  it('should calculate node hash correctly', async () => {
    const { reverseRegistrar, accounts } = await loadFixture(fixture)

    await expect(
      reverseRegistrar.read.node([accounts[0].address]),
    ).resolves.toEqual(getReverseNodeHash(accounts[0].address))
  })

  describe('claim', () => {
    it('allows an account to claim its address', async () => {
      const { ensRegistry, reverseRegistrar, accounts } = await loadFixture(
        fixture,
      )

      await reverseRegistrar.write.claim([accounts[1].address])

      await expect(
        ensRegistry.read.owner([getReverseNodeHash(accounts[0].address)]),
      ).resolves.toEqualAddress(accounts[1].address)
    })

    it('event ReverseClaimed is emitted', async () => {
      const { reverseRegistrar, accounts } = await loadFixture(fixture)

      await expect(reverseRegistrar)
        .write('claim', [accounts[1].address])
        .toEmitEvent('ReverseClaimed')
        .withArgs(accounts[0].address, getReverseNodeHash(accounts[0].address))
    })
  })

  describe('claimForAddr', () => {
    it('allows an account to claim its address', async () => {
      const { ensRegistry, reverseRegistrar, publicResolver, accounts } =
        await loadFixture(fixture)

      await reverseRegistrar.write.claimForAddr([
        accounts[0].address,
        accounts[1].address,
        publicResolver.address,
      ])

      await expect(
        ensRegistry.read.owner([getReverseNodeHash(accounts[0].address)]),
      ).resolves.toEqualAddress(accounts[1].address)
    })

    it('event ReverseClaimed is emitted', async () => {
      const { reverseRegistrar, publicResolver, accounts } = await loadFixture(
        fixture,
      )

      await expect(reverseRegistrar)
        .write('claimForAddr', [
          accounts[0].address,
          accounts[1].address,
          publicResolver.address,
        ])
        .toEmitEvent('ReverseClaimed')
        .withArgs(accounts[0].address, getReverseNodeHash(accounts[0].address))
    })

    it('forbids an account to claim another address', async () => {
      const { reverseRegistrar, publicResolver, accounts } = await loadFixture(
        fixture,
      )

      await expect(reverseRegistrar)
        .write('claimForAddr', [
          accounts[1].address,
          accounts[0].address,
          publicResolver.address,
        ])
        .toBeRevertedWithoutReason()
    })

    it('allows an authorised account to claim a different address', async () => {
      const { ensRegistry, reverseRegistrar, publicResolver, accounts } =
        await loadFixture(fixture)

      await ensRegistry.write.setApprovalForAll([accounts[0].address, true], {
        account: accounts[1],
      })
      await reverseRegistrar.write.claimForAddr([
        accounts[1].address,
        accounts[2].address,
        publicResolver.address,
      ])

      await expect(
        ensRegistry.read.owner([getReverseNodeHash(accounts[1].address)]),
      ).resolves.toEqualAddress(accounts[2].address)
    })

    it('allows a controller to claim a different address', async () => {
      const { ensRegistry, reverseRegistrar, publicResolver, accounts } =
        await loadFixture(fixture)

      await reverseRegistrar.write.setController([accounts[0].address, true])
      await reverseRegistrar.write.claimForAddr([
        accounts[1].address,
        accounts[2].address,
        publicResolver.address,
      ])

      await expect(
        ensRegistry.read.owner([getReverseNodeHash(accounts[1].address)]),
      ).resolves.toEqualAddress(accounts[2].address)
    })

    it('allows an owner() of a contract to claim the reverse node of that contract', async () => {
      const {
        ensRegistry,
        reverseRegistrar,
        dummyOwnable,
        publicResolver,
        accounts,
      } = await loadFixture(fixture)

      await reverseRegistrar.write.setController([accounts[0].address, true])
      await reverseRegistrar.write.claimForAddr([
        dummyOwnable.address,
        accounts[0].address,
        publicResolver.address,
      ])

      await expect(
        ensRegistry.read.owner([getReverseNodeHash(dummyOwnable.address)]),
      ).resolves.toEqualAddress(accounts[0].address)
    })
  })

  describe('claimWithResolver', async () => {
    it('allows an account to specify resolver', async () => {
      const { ensRegistry, reverseRegistrar, accounts } = await loadFixture(
        fixture,
      )

      await reverseRegistrar.write.claimWithResolver([
        accounts[1].address,
        accounts[2].address,
      ])

      await expect(
        ensRegistry.read.owner([getReverseNodeHash(accounts[0].address)]),
      ).resolves.toEqualAddress(accounts[1].address)
      await expect(
        ensRegistry.read.resolver([getReverseNodeHash(accounts[0].address)]),
      ).resolves.toEqualAddress(accounts[2].address)
    })

    it('event ReverseClaimed is emitted', async () => {
      const { reverseRegistrar, accounts } = await loadFixture(fixture)

      await expect(reverseRegistrar)
        .write('claimWithResolver', [accounts[1].address, accounts[2].address])
        .toEmitEvent('ReverseClaimed')
        .withArgs(accounts[0].address, getReverseNodeHash(accounts[0].address))
    })
  })

  describe('setName', () => {
    it('allows controller to set name records for other accounts', async () => {
      const { ensRegistry, reverseRegistrar, publicResolver, accounts } =
        await loadFixture(fixture)

      await reverseRegistrar.write.setController([accounts[0].address, true])
      await reverseRegistrar.write.setNameForAddr([
        accounts[1].address,
        accounts[0].address,
        publicResolver.address,
        'testname',
      ])

      await expect(
        ensRegistry.read.resolver([getReverseNodeHash(accounts[1].address)]),
      ).resolves.toEqualAddress(publicResolver.address)
      await expect(
        publicResolver.read.name([getReverseNodeHash(accounts[1].address)]),
      ).resolves.toEqual('testname')
    })

    it('event ReverseClaimed is emitted', async () => {
      const { reverseRegistrar, publicResolver, accounts } = await loadFixture(
        fixture,
      )

      await expect(reverseRegistrar)
        .write('setNameForAddr', [
          accounts[0].address,
          accounts[0].address,
          publicResolver.address,
          'testname',
        ])
        .toEmitEvent('ReverseClaimed')
        .withArgs(accounts[0].address, getReverseNodeHash(accounts[0].address))
    })

    it('forbids non-controller if address is different from sender and not authorised', async () => {
      const { reverseRegistrar, publicResolver, accounts } = await loadFixture(
        fixture,
      )

      await expect(reverseRegistrar)
        .write('setNameForAddr', [
          accounts[1].address,
          accounts[0].address,
          publicResolver.address,
          'testname',
        ])
        .toBeRevertedWithoutReason()
    })

    it('allows name to be set for an address if the sender is the address', async () => {
      const { ensRegistry, reverseRegistrar, publicResolver, accounts } =
        await loadFixture(fixture)

      await reverseRegistrar.write.setNameForAddr([
        accounts[0].address,
        accounts[0].address,
        publicResolver.address,
        'testname',
      ])

      await expect(
        ensRegistry.read.resolver([getReverseNodeHash(accounts[0].address)]),
      ).resolves.toEqualAddress(publicResolver.address)
      await expect(
        publicResolver.read.name([getReverseNodeHash(accounts[0].address)]),
      ).resolves.toEqual('testname')
    })

    it('allows name to be set for an address if the sender is authorised', async () => {
      const { ensRegistry, reverseRegistrar, publicResolver, accounts } =
        await loadFixture(fixture)

      await ensRegistry.write.setApprovalForAll([accounts[1].address, true])
      await reverseRegistrar.write.setNameForAddr(
        [
          accounts[0].address,
          accounts[0].address,
          publicResolver.address,
          'testname',
        ],
        { account: accounts[1] },
      )

      await expect(
        ensRegistry.read.resolver([getReverseNodeHash(accounts[0].address)]),
      ).resolves.toEqualAddress(publicResolver.address)
      await expect(
        publicResolver.read.name([getReverseNodeHash(accounts[0].address)]),
      ).resolves.toEqual('testname')
    })

    it('allows an owner() of a contract to claimWithResolverForAddr on behalf of the contract', async () => {
      const {
        ensRegistry,
        reverseRegistrar,
        dummyOwnable,
        publicResolver,
        accounts,
      } = await loadFixture(fixture)

      await reverseRegistrar.write.setNameForAddr([
        dummyOwnable.address,
        accounts[0].address,
        publicResolver.address,
        'dummyownable.eth',
      ])

      await expect(
        ensRegistry.read.owner([getReverseNodeHash(dummyOwnable.address)]),
      ).resolves.toEqualAddress(accounts[0].address)
      await expect(
        publicResolver.read.name([getReverseNodeHash(dummyOwnable.address)]),
      ).resolves.toEqual('dummyownable.eth')
    })
  })

  describe('setController', () => {
    it('forbids non-owner from setting a controller', async () => {
      const { reverseRegistrar, accounts } = await loadFixture(fixture)

      await expect(reverseRegistrar)
        .write('setController', [accounts[1].address, true], {
          account: accounts[1],
        })
        .toBeRevertedWithString('Ownable: caller is not the owner')
    })
  })
})
