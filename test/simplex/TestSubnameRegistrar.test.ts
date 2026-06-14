import hre from 'hardhat'
import {
  encodePacked,
  keccak256,
  labelhash,
  namehash,
  zeroHash,
  getAddress,
} from 'viem'
import { describe, it, expect } from 'vitest'

const connection = await hre.network.connect()
const [ownerClient, aliceClient, otherClient] =
  await connection.viem.getWalletClients()
const ownerAccount = ownerClient.account
const aliceAccount = aliceClient.account
const otherAccount = otherClient.account

const ALICE_NODE = namehash('alice.testing')
const subnode = (parent: `0x${string}`, label: string) =>
  keccak256(encodePacked(['bytes32', 'bytes32'], [parent, labelhash(label)]))

async function fixture() {
  const ensRegistry = await connection.viem.deployContract('ENSRegistry', [])
  // owner -> testing -> alice.testing (owned by alice)
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
  const subnames = await connection.viem.deployContract('SubnameRegistrar', [
    ensRegistry.address,
  ])
  return { ensRegistry, subnames }
}

const loadFixture = async () => connection.networkHelpers.loadFixture(fixture)

async function approve(ensRegistry: any, subnames: any, account: any) {
  await ensRegistry.write.setApprovalForAll([subnames.address, true], {
    account,
  })
}

describe('SubnameRegistrar', () => {
  describe('createSubname', () => {
    it('creates a subname owned by the parent owner and indexes it', async () => {
      const { ensRegistry, subnames } = await loadFixture()
      await approve(ensRegistry, subnames, aliceAccount)
      await subnames.write.createSubname([ALICE_NODE, 'mobile'], {
        account: aliceAccount,
      })

      const node = subnode(ALICE_NODE, 'mobile')
      expect(await ensRegistry.read.owner([node])).toBe(
        getAddress(aliceAccount.address),
      )
      expect(await subnames.read.childrenLength([ALICE_NODE])).toBe(1n)
      expect(await subnames.read.childIndexed([node])).toBe(true)
      expect(await subnames.read.labelOf([labelhash('mobile')])).toBe('mobile')

      const [hashes, labels] = await subnames.read.getChildren([
        ALICE_NODE,
        0n,
        10n,
      ])
      expect(hashes).toEqual([labelhash('mobile')])
      expect(labels).toEqual(['mobile'])
    })

    it('reverts without the registry operator approval', async () => {
      const { subnames } = await loadFixture()
      await expect(
        subnames.write.createSubname([ALICE_NODE, 'mobile'], {
          account: aliceAccount,
        }),
      ).rejects.toThrow()
    })

    it('reverts when the caller does not own the parent', async () => {
      const { ensRegistry, subnames } = await loadFixture()
      await approve(ensRegistry, subnames, otherAccount)
      await expect(
        subnames.write.createSubname([ALICE_NODE, 'mobile'], {
          account: otherAccount,
        }),
      ).rejects.toThrow('NotParentOwner')
    })

    it('dedups a repeated create of the same label', async () => {
      const { ensRegistry, subnames } = await loadFixture()
      await approve(ensRegistry, subnames, aliceAccount)
      await subnames.write.createSubname([ALICE_NODE, 'mobile'], {
        account: aliceAccount,
      })
      await subnames.write.createSubname([ALICE_NODE, 'mobile'], {
        account: aliceAccount,
      })
      expect(await subnames.read.childrenLength([ALICE_NODE])).toBe(1n)
    })
  })

  describe('submitSubname (permissionless backfill)', () => {
    it('indexes an existing, parent-owned subname', async () => {
      const { ensRegistry, subnames } = await loadFixture()
      // alice creates a subname directly on the registry (owned by herself)
      await ensRegistry.write.setSubnodeOwner(
        [ALICE_NODE, labelhash('direct'), aliceAccount.address],
        { account: aliceAccount },
      )
      // anyone may submit it
      await subnames.write.submitSubname([ALICE_NODE, 'direct'], {
        account: otherAccount,
      })
      expect(await subnames.read.childrenLength([ALICE_NODE])).toBe(1n)
      expect(await subnames.read.labelOf([labelhash('direct')])).toBe('direct')
    })

    it('rejects a foreign-owned subname', async () => {
      const { ensRegistry, subnames } = await loadFixture()
      await ensRegistry.write.setSubnodeOwner(
        [ALICE_NODE, labelhash('foreign'), otherAccount.address],
        { account: aliceAccount },
      )
      await expect(
        subnames.write.submitSubname([ALICE_NODE, 'foreign']),
      ).rejects.toThrow('OwnerMismatch')
    })

    it('rejects a subname that does not exist', async () => {
      const { subnames } = await loadFixture()
      await expect(
        subnames.write.submitSubname([ALICE_NODE, 'ghost']),
      ).rejects.toThrow('SubnameDoesNotExist')
    })
  })

  describe('getChildren pagination', () => {
    it('returns the requested window', async () => {
      const { ensRegistry, subnames } = await loadFixture()
      await approve(ensRegistry, subnames, aliceAccount)
      for (const label of ['a-one', 'a-two', 'a-three']) {
        await subnames.write.createSubname([ALICE_NODE, label], {
          account: aliceAccount,
        })
      }
      expect(await subnames.read.childrenLength([ALICE_NODE])).toBe(3n)

      const [hashes] = await subnames.read.getChildren([ALICE_NODE, 1n, 1n])
      expect(hashes).toEqual([labelhash('a-two')])

      const [pastEnd] = await subnames.read.getChildren([ALICE_NODE, 9n, 5n])
      expect(pastEnd).toEqual([])
    })
  })
})
