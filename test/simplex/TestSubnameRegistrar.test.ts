import hre from 'hardhat'
import {
  encodePacked,
  keccak256,
  labelhash,
  namehash,
  zeroHash,
  zeroAddress,
  getAddress,
} from 'viem'
import { describe, it, expect } from 'vitest'

const connection = await hre.network.connect()
const [ownerClient, aliceClient, bobClient] =
  await connection.viem.getWalletClients()
const ownerAccount = ownerClient.account // stands in as BaseRegistrar (onReregister)
const aliceAccount = aliceClient.account
const bobAccount = bobClient.account

const ALICE_NODE = namehash('alice.testing')
const subnode = (parent: `0x${string}`, label: string) =>
  keccak256(encodePacked(['bytes32', 'bytes32'], [parent, labelhash(label)]))

async function fixture() {
  const ensRegistry = await connection.viem.deployContract('ENSRegistry', [])
  // owner -> testing -> alice.testing. alice's registry ownership of the 2LD
  // node stands in for "alice holds the 2LD NFT" (BaseRegistrar auto-reclaim
  // keeps these equal on-chain).
  await ensRegistry.write.setSubnodeOwner([
    zeroHash,
    labelhash('testing'),
    ownerAccount.address,
  ])
  await ensRegistry.write.setSubnodeOwner([
    namehash('testing'),
    labelhash('alice'),
    aliceAccount.address,
  ])
  // Reverse namespace + registrar — the verbatim PublicResolver's ReverseClaimer
  // constructor looks up the reverse registrar via the registry and claims a
  // reverse record, so this must exist before the resolver is deployed.
  await ensRegistry.write.setSubnodeOwner([
    zeroHash,
    labelhash('reverse'),
    ownerAccount.address,
  ])
  const reverseRegistrar = await connection.viem.deployContract(
    'ReverseRegistrar',
    [ensRegistry.address],
  )
  await ensRegistry.write.setSubnodeOwner([
    namehash('reverse'),
    labelhash('addr'),
    reverseRegistrar.address,
  ])
  // SubnameRegistrar(ens, baseRegistrar). ownerAccount stands in as the
  // BaseRegistrar so tests can drive onReregister directly.
  const subnames = await connection.viem.deployContract('SubnameRegistrar', [
    ensRegistry.address,
    ownerAccount.address,
  ])
  // The verbatim PublicResolver, wired with nameWrapper = subnames so it
  // authorises subname records against subnames.ownerOf.
  const resolver = await connection.viem.deployContract('PublicResolver', [
    ensRegistry.address,
    subnames.address,
    zeroAddress,
    reverseRegistrar.address,
  ])
  await subnames.write.setResolver([resolver.address])
  return { ensRegistry, subnames, resolver }
}

const loadFixture = async () => connection.networkHelpers.loadFixture(fixture)

async function approve(ensRegistry: any, subnames: any, account: any) {
  await ensRegistry.write.setApprovalForAll([subnames.address, true], { account })
}

describe('SubnameRegistrar (soulbound)', () => {
  describe('createSubname', () => {
    it('creates a registrar-owned subname whose effective owner is the 2LD holder', async () => {
      const { ensRegistry, subnames, resolver } = await loadFixture()
      await approve(ensRegistry, subnames, aliceAccount)
      await subnames.write.createSubname([ALICE_NODE, 'mobile'], {
        account: aliceAccount,
      })

      const node = subnode(ALICE_NODE, 'mobile')
      // owned in the registry by the registrar...
      expect(await ensRegistry.read.owner([node])).toBe(
        getAddress(subnames.address),
      )
      // ...but its effective owner is the 2LD holder (alice)
      expect(await subnames.read.ownerOf([BigInt(node)])).toBe(
        getAddress(aliceAccount.address),
      )
      // resolver is wired so records resolve
      expect(await ensRegistry.read.resolver([node])).toBe(
        getAddress(resolver.address),
      )
      expect(await subnames.read.childrenLength([ALICE_NODE])).toBe(1n)
      expect(await subnames.read.labelOf([labelhash('mobile')])).toBe('mobile')
    })

    it('reverts without the registry operator approval', async () => {
      const { subnames } = await loadFixture()
      await expect(
        subnames.write.createSubname([ALICE_NODE, 'mobile'], {
          account: aliceAccount,
        }),
      ).rejects.toThrow()
    })

    it('reverts when the caller is not the 2LD holder', async () => {
      const { ensRegistry, subnames } = await loadFixture()
      await approve(ensRegistry, subnames, bobAccount)
      await expect(
        subnames.write.createSubname([ALICE_NODE, 'mobile'], {
          account: bobAccount,
        }),
      ).rejects.toThrow('NotParentOwner')
    })

    it('rejects a 64-byte label', async () => {
      const { ensRegistry, subnames } = await loadFixture()
      await approve(ensRegistry, subnames, aliceAccount)
      await expect(
        subnames.write.createSubname([ALICE_NODE, 'm'.repeat(64)], {
          account: aliceAccount,
        }),
      ).rejects.toThrow('LabelTooLong')
    })
  })

  describe('soulbound to the NFT', () => {
    it('subname ownership follows the 2LD when it changes hands', async () => {
      const { ensRegistry, subnames } = await loadFixture()
      await approve(ensRegistry, subnames, aliceAccount)
      await subnames.write.createSubname([ALICE_NODE, 'mobile'], {
        account: aliceAccount,
      })
      const node = subnode(ALICE_NODE, 'mobile')
      expect(await subnames.read.ownerOf([BigInt(node)])).toBe(
        getAddress(aliceAccount.address),
      )

      // simulate an NFT transfer: BaseRegistrar auto-reclaim re-points the 2LD
      // node to the new holder.
      await ensRegistry.write.setOwner([ALICE_NODE, bobAccount.address], {
        account: aliceAccount,
      })

      // the subname moved with it, no re-seize
      expect(await subnames.read.ownerOf([BigInt(node)])).toBe(
        getAddress(bobAccount.address),
      )
      // and is still registrar-owned in the registry
      expect(await ensRegistry.read.owner([node])).toBe(
        getAddress(subnames.address),
      )
    })
  })

  describe('resolver authorisation', () => {
    it('lets the 2LD holder set the subname records (and not others)', async () => {
      const { ensRegistry, subnames, resolver } = await loadFixture()
      await approve(ensRegistry, subnames, aliceAccount)
      await subnames.write.createSubname([ALICE_NODE, 'mobile'], {
        account: aliceAccount,
      })
      const node = subnode(ALICE_NODE, 'mobile')

      await resolver.write.setText([node, 'simplex.contact', 'smp://x'], {
        account: aliceAccount,
      })
      expect(await resolver.read.text([node, 'simplex.contact'])).toBe('smp://x')

      // bob (not the holder) cannot
      await expect(
        resolver.write.setText([node, 'simplex.contact', 'evil'], {
          account: bobAccount,
        }),
      ).rejects.toThrow()

      // after the 2LD moves to bob, bob can and alice cannot
      await ensRegistry.write.setOwner([ALICE_NODE, bobAccount.address], {
        account: aliceAccount,
      })
      await resolver.write.setText([node, 'simplex.contact', 'smp://bob'], {
        account: bobAccount,
      })
      expect(await resolver.read.text([node, 'simplex.contact'])).toBe('smp://bob')
      await expect(
        resolver.write.setText([node, 'simplex.contact', 'back'], {
          account: aliceAccount,
        }),
      ).rejects.toThrow()
    })
  })

  describe('depth', () => {
    it('supports a subname of a subname (ownerOf walks up to the 2LD)', async () => {
      const { ensRegistry, subnames } = await loadFixture()
      await approve(ensRegistry, subnames, aliceAccount)
      await subnames.write.createSubname([ALICE_NODE, 'mobile'], {
        account: aliceAccount,
      })
      const mobileNode = subnode(ALICE_NODE, 'mobile')
      // alice is the effective owner of mobile, so she can create under it.
      // The registrar already owns mobile, so no extra approval is needed.
      await subnames.write.createSubname([mobileNode, 'work'], {
        account: aliceAccount,
      })
      const deepNode = subnode(mobileNode, 'work')
      expect(await ensRegistry.read.owner([deepNode])).toBe(
        getAddress(subnames.address),
      )
      expect(await subnames.read.ownerOf([BigInt(deepNode)])).toBe(
        getAddress(aliceAccount.address),
      )
      // the whole tree follows the NFT
      await ensRegistry.write.setOwner([ALICE_NODE, bobAccount.address], {
        account: aliceAccount,
      })
      expect(await subnames.read.ownerOf([BigInt(deepNode)])).toBe(
        getAddress(bobAccount.address),
      )
    })
  })

  describe('deleteSubname', () => {
    it('clears the subname record and index', async () => {
      const { ensRegistry, subnames } = await loadFixture()
      await approve(ensRegistry, subnames, aliceAccount)
      await subnames.write.createSubname([ALICE_NODE, 'mobile'], {
        account: aliceAccount,
      })
      const node = subnode(ALICE_NODE, 'mobile')
      await subnames.write.deleteSubname([ALICE_NODE, 'mobile'], {
        account: aliceAccount,
      })
      expect(await ensRegistry.read.owner([node])).toBe(zeroAddress)
      expect(await subnames.read.childIndexed([node])).toBe(false)
      expect(await subnames.read.childrenLength([ALICE_NODE])).toBe(0n)
      expect(await subnames.read.ownerOf([BigInt(node)])).toBe(zeroAddress)
    })

    it('rejects delete from a non-holder', async () => {
      const { ensRegistry, subnames } = await loadFixture()
      await approve(ensRegistry, subnames, aliceAccount)
      await subnames.write.createSubname([ALICE_NODE, 'mobile'], {
        account: aliceAccount,
      })
      await expect(
        subnames.write.deleteSubname([ALICE_NODE, 'mobile'], {
          account: bobAccount,
        }),
      ).rejects.toThrow('NotParentOwner')
    })
  })

  describe('generation / garbage collection', () => {
    it('invalidates subnames when the 2LD is re-registered, and purge reclaims them', async () => {
      const { ensRegistry, subnames } = await loadFixture()
      await approve(ensRegistry, subnames, aliceAccount)
      await subnames.write.createSubname([ALICE_NODE, 'mobile'], {
        account: aliceAccount,
      })
      const node = subnode(ALICE_NODE, 'mobile')
      expect(await subnames.read.ownerOf([BigInt(node)])).toBe(
        getAddress(aliceAccount.address),
      )

      // re-registration (driven here by the stand-in BaseRegistrar)
      await subnames.write.onReregister([ALICE_NODE], { account: ownerAccount })

      // the old subname is now dead — not owned by anyone
      expect(await subnames.read.ownerOf([BigInt(node)])).toBe(zeroAddress)

      // anyone may purge the dead entry to reclaim its storage
      await subnames.write.purge([ALICE_NODE, [labelhash('mobile')]], {
        account: bobAccount,
      })
      expect(await ensRegistry.read.owner([node])).toBe(zeroAddress)
      expect(await subnames.read.childIndexed([node])).toBe(false)

      // purge leaves a still-live subname alone
      await subnames.write.createSubname([ALICE_NODE, 'fresh'], {
        account: aliceAccount,
      })
      await subnames.write.purge([ALICE_NODE, [labelhash('fresh')]], {
        account: bobAccount,
      })
      expect(await subnames.read.childIndexed([subnode(ALICE_NODE, 'fresh')])).toBe(
        true,
      )
    })

    it('only the BaseRegistrar may bump a generation', async () => {
      const { subnames } = await loadFixture()
      await expect(
        subnames.write.onReregister([ALICE_NODE], { account: aliceAccount }),
      ).rejects.toThrow('NotBaseRegistrar')
    })
  })

  describe('setResolver', () => {
    it('can only be set once, by the deployer', async () => {
      const { subnames, resolver } = await loadFixture()
      await expect(
        subnames.write.setResolver([resolver.address], { account: ownerAccount }),
      ).rejects.toThrow('AlreadyInitialised')
    })
  })
})
