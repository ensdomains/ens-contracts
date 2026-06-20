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

// Seeded property/fuzz test for SubnameRegistrar index integrity. Over a random
// sequence of create / repeat-create operations, the invariants are:
//   - childrenLength == number of DISTINCT subnames indexed (dedup holds),
//   - getChildren returns each distinct labelhash exactly once,
//   - labelOf round-trips every indexed label,
//   - every indexed child node is owned in the registry by the registrar, and
//     its effective owner (ownerOf) is the 2LD holder (soulbound).

const connection = await hre.network.connect()
const [ownerClient, aliceClient] = await connection.viem.getWalletClients()
const ownerAccount = ownerClient.account // stands in as BaseRegistrar
const aliceAccount = aliceClient.account
const ALICE_NODE = namehash('alice.testing')
const subnode = (label: string) =>
  keccak256(
    encodePacked(['bytes32', 'bytes32'], [ALICE_NODE, labelhash(label)]),
  )

async function fixture() {
  const ensRegistry = await connection.viem.deployContract('ENSRegistry', [])
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
    ownerAccount.address,
  ])
  await ensRegistry.write.setApprovalForAll([subnames.address, true], {
    account: aliceAccount,
  })
  return { ensRegistry, subnames }
}
const loadFixture = async () => connection.networkHelpers.loadFixture(fixture)

function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('SubnameRegistrar (fuzz)', () => {
  it('keeps the index deduped and consistent over random op sequences', async () => {
    for (const seed of [1, 42, 7777]) {
      const { ensRegistry, subnames } = await loadFixture()
      const rnd = mulberry32(seed)
      const labels = Array.from({ length: 14 }, (_, i) => `sub-${seed}-${i}`)
      const indexed = new Set<string>()

      for (let step = 0; step < 40; step++) {
        const label = labels[Math.floor(rnd() * labels.length)]
        // create (or repeat-create, which must dedup)
        await subnames.write.createSubname([ALICE_NODE, label], {
          account: aliceAccount,
        })
        indexed.add(label)
      }

      // dedup invariant: childrenLength == distinct count
      expect(await subnames.read.childrenLength([ALICE_NODE])).toBe(
        BigInt(indexed.size),
      )

      // getChildren returns each distinct labelhash exactly once
      const [hashes, labelsOut] = await subnames.read.getChildren([
        ALICE_NODE,
        0n,
        100n,
      ])
      const expectedHashes = new Set([...indexed].map((l) => labelhash(l)))
      expect(hashes.length).toBe(expectedHashes.size)
      expect(new Set(hashes)).toEqual(expectedHashes)

      // labelOf round-trips; each child is registrar-owned and effectively
      // owned by the 2LD holder
      for (let i = 0; i < hashes.length; i++) {
        expect(await subnames.read.labelOf([hashes[i]])).toBe(labelsOut[i])
        const node = subnode(labelsOut[i])
        expect(await ensRegistry.read.owner([node])).toBe(
          getAddress(subnames.address),
        )
        expect(await subnames.read.ownerOf([BigInt(node)])).toBe(
          getAddress(aliceAccount.address),
        )
      }
    }
  }, 60000)
})
