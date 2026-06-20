import hre from 'hardhat'
import {
  labelhash,
  namehash,
  zeroHash,
  getAddress,
  keccak256,
  toFunctionSelector,
} from 'viem'
import { describe, it, expect } from 'vitest'

import { DAY } from '../fixtures/constants.js'

const connection = await hre.network.connect()
const publicClient = await connection.viem.getPublicClient()
const [ownerClient, registrantClient, otherClient] =
  await connection.viem.getWalletClients()
const ownerAccount = ownerClient.account
const registrantAccount = registrantClient.account
const otherAccount = otherClient.account

const DURATION = 365n * DAY

async function fixture() {
  const ensRegistry = await connection.viem.deployContract('ENSRegistry', [])
  const baseRegistrar = await connection.viem.deployContract(
    'BaseRegistrarImplementation',
    [ensRegistry.address, namehash('testing')],
  )
  // Registrar must own the TLD node for the `live` modifier to pass.
  await ensRegistry.write.setSubnodeOwner([
    zeroHash,
    labelhash('testing'),
    baseRegistrar.address,
  ])
  // Drive registration directly from the owner account, acting as a controller.
  await baseRegistrar.write.addController([ownerAccount.address])
  const renderer = await connection.viem.deployContract('MetadataRenderer', [
    '.testing',
  ])
  return { ensRegistry, baseRegistrar, renderer }
}

const loadFixture = async () => connection.networkHelpers.loadFixture(fixture)

const registerLabel = (
  baseRegistrar: any,
  label: string,
  owner: `0x${string}`,
) => baseRegistrar.write.registerWithLabel([label, owner, DURATION])

describe('BaseRegistrarImplementation v3', () => {
  describe('label index', () => {
    it('records the plaintext label on registerWithLabel', async () => {
      const { baseRegistrar } = await loadFixture()
      await registerLabel(baseRegistrar, 'alice', registrantAccount.address)
      const id = BigInt(labelhash('alice'))
      expect(await baseRegistrar.read.labelOf([id])).toBe('alice')
    })

    it('write-once: re-registration after expiry keeps the label', async () => {
      const { baseRegistrar } = await loadFixture()
      await registerLabel(baseRegistrar, 'alice', registrantAccount.address)
      const id = BigInt(labelhash('alice'))
      // expire past the grace period, then re-register to a new owner
      await connection.networkHelpers.time.increase(DURATION + 91n * DAY)
      await registerLabel(baseRegistrar, 'alice', otherAccount.address)
      expect(await baseRegistrar.read.labelOf([id])).toBe('alice')
      expect(await baseRegistrar.read.ownerOf([id])).toBe(
        getAddress(otherAccount.address),
      )
    })

  })

  describe('ERC721Enumerable', () => {
    it('enumerates names by owner and globally', async () => {
      const { baseRegistrar } = await loadFixture()
      await registerLabel(baseRegistrar, 'alice', registrantAccount.address)
      await registerLabel(baseRegistrar, 'carol', registrantAccount.address)

      expect(await baseRegistrar.read.totalSupply()).toBe(2n)
      expect(
        await baseRegistrar.read.balanceOf([registrantAccount.address]),
      ).toBe(2n)

      const owned = await Promise.all([
        baseRegistrar.read.tokenOfOwnerByIndex([
          registrantAccount.address,
          0n,
        ]),
        baseRegistrar.read.tokenOfOwnerByIndex([
          registrantAccount.address,
          1n,
        ]),
      ])
      expect(owned.map((x) => x.toString()).sort()).toEqual(
        [BigInt(labelhash('alice')), BigInt(labelhash('carol'))]
          .map((x) => x.toString())
          .sort(),
      )
    })

    it('keeps per-owner enumeration correct across transfers', async () => {
      const { baseRegistrar } = await loadFixture()
      await registerLabel(baseRegistrar, 'alice', registrantAccount.address)
      const id = BigInt(labelhash('alice'))
      await baseRegistrar.write.transferFrom(
        [registrantAccount.address, otherAccount.address, id],
        { account: registrantAccount },
      )
      expect(
        await baseRegistrar.read.balanceOf([registrantAccount.address]),
      ).toBe(0n)
      expect(await baseRegistrar.read.balanceOf([otherAccount.address])).toBe(
        1n,
      )
      expect(
        await baseRegistrar.read.tokenOfOwnerByIndex([
          otherAccount.address,
          0n,
        ]),
      ).toBe(id)
    })
  })

  describe('tokenURI / metadata renderer', () => {
    it('returns empty string when no renderer is set', async () => {
      const { baseRegistrar } = await loadFixture()
      await registerLabel(baseRegistrar, 'alice', registrantAccount.address)
      expect(
        await baseRegistrar.read.tokenURI([BigInt(labelhash('alice'))]),
      ).toBe('')
    })

    it('delegates to the renderer once set', async () => {
      const { baseRegistrar, renderer } = await loadFixture()
      await registerLabel(baseRegistrar, 'alice', registrantAccount.address)
      await baseRegistrar.write.setMetadataRenderer([renderer.address])
      const uri = await baseRegistrar.read.tokenURI([
        BigInt(labelhash('alice')),
      ])
      expect(uri.startsWith('data:application/json;base64,')).toBe(true)
      const json = JSON.parse(
        Buffer.from(uri.split(',')[1], 'base64').toString(),
      )
      expect(json.name).toBe('alice.testing')
    })

    it('only the owner can set the renderer', async () => {
      const { baseRegistrar, renderer } = await loadFixture()
      await expect(
        baseRegistrar.write.setMetadataRenderer([renderer.address], {
          account: otherAccount,
        }),
      ).rejects.toThrow()
    })
  })

  describe('supportsInterface', () => {
    it('advertises ERC721, ERC721Metadata, ERC721Enumerable and reclaim', async () => {
      const { baseRegistrar } = await loadFixture()
      const ids = {
        erc165: '0x01ffc9a7',
        erc721: '0x80ac58cd',
        erc721Metadata: '0x5b5e139f',
        erc721Enumerable: '0x780e9d63',
        reclaim: toFunctionSelector('reclaim(uint256,address)'),
      } as const
      for (const id of Object.values(ids)) {
        expect(await baseRegistrar.read.supportsInterface([id])).toBe(true)
      }
      expect(await baseRegistrar.read.supportsInterface(['0xffffffff'])).toBe(
        false,
      )
    })
  })

  describe('adversarial', () => {
    it('rejects registerWithLabel from a non-controller', async () => {
      const { baseRegistrar } = await loadFixture()
      await expect(
        baseRegistrar.write.registerWithLabel(
          ['alice', otherAccount.address, DURATION],
          { account: otherAccount },
        ),
      ).rejects.toThrow()
    })

    it('tokenURI reverts for a non-existent token', async () => {
      const { baseRegistrar, renderer } = await loadFixture()
      await baseRegistrar.write.setMetadataRenderer([renderer.address])
      await expect(
        baseRegistrar.read.tokenURI([BigInt(labelhash('neverminted'))]),
      ).rejects.toThrow()
    })

    it('tokenURI still renders an expired-but-unburned token (known edge)', async () => {
      // The ERC-721 token is not burned on expiry (only on re-registration), so
      // _requireMinted passes and metadata still renders. Expiry filtering is a
      // read-side (dApp) concern; documented here so the behaviour is explicit.
      const { baseRegistrar, renderer } = await loadFixture()
      await registerLabel(baseRegistrar, 'alice', registrantAccount.address)
      await baseRegistrar.write.setMetadataRenderer([renderer.address])
      await connection.networkHelpers.time.increase(DURATION + 91n * DAY)
      const uri = await baseRegistrar.read.tokenURI([BigInt(labelhash('alice'))])
      expect(uri.startsWith('data:application/json;base64,')).toBe(true)
    })

    it('handles an empty label without reverting (labelOf stays empty)', async () => {
      const { baseRegistrar } = await loadFixture()
      await registerLabel(baseRegistrar, '', registrantAccount.address)
      // The contract derives id = keccak256(bytes("")); note viem's labelhash("")
      // special-cases to the zero hash, which is NOT the id used here.
      const id = BigInt(keccak256('0x'))
      expect(await baseRegistrar.read.labelOf([id])).toBe('')
      expect(await baseRegistrar.read.ownerOf([id])).toBe(
        getAddress(registrantAccount.address),
      )
    })
  })

  describe('max label length guard', () => {
    it('defaults to no limit (long labels register)', async () => {
      const { baseRegistrar } = await loadFixture()
      expect(await baseRegistrar.read.maxLabelLength()).toBe(0n)
      await registerLabel(
        baseRegistrar,
        'a-very-long-label-name-indeed',
        registrantAccount.address,
      )
    })

    it('enforces the limit once set', async () => {
      const { baseRegistrar } = await loadFixture()
      await baseRegistrar.write.setMaxLabelLength([5n])
      await expect(
        registerLabel(baseRegistrar, 'sixsix', registrantAccount.address),
      ).rejects.toThrow('LabelTooLong')
      // exactly at the limit is allowed
      await registerLabel(baseRegistrar, 'fives', registrantAccount.address)
      expect(
        await baseRegistrar.read.labelOf([BigInt(labelhash('fives'))]),
      ).toBe('fives')
    })

    it('only the owner can set the limit', async () => {
      const { baseRegistrar } = await loadFixture()
      await expect(
        baseRegistrar.write.setMaxLabelLength([5n], { account: otherAccount }),
      ).rejects.toThrow()
    })
  })

  describe('auto-reclaim + generation (subname ownership tracking)', () => {
    it('re-points the ENS registry node to the new holder on transfer', async () => {
      const { ensRegistry, baseRegistrar } = await loadFixture()
      await registerLabel(baseRegistrar, 'alice', registrantAccount.address)
      const node = namehash('alice.testing')
      expect(await ensRegistry.read.owner([node])).toBe(
        getAddress(registrantAccount.address),
      )
      await baseRegistrar.write.transferFrom(
        [
          registrantAccount.address,
          otherAccount.address,
          BigInt(labelhash('alice')),
        ],
        { account: registrantAccount },
      )
      // the registry "manager" followed the NFT — no separate reclaim
      expect(await ensRegistry.read.owner([node])).toBe(
        getAddress(otherAccount.address),
      )
    })

    it('only the owner can set the subname hook', async () => {
      const { baseRegistrar } = await loadFixture()
      await expect(
        baseRegistrar.write.setSubnameHook([otherAccount.address], {
          account: otherAccount,
        }),
      ).rejects.toThrow()
    })

    it('bumps the SubnameRegistrar generation when a name is re-registered', async () => {
      const { ensRegistry, baseRegistrar } = await loadFixture()
      const subnames = await connection.viem.deployContract('SubnameRegistrar', [
        ensRegistry.address,
        baseRegistrar.address,
      ])
      await baseRegistrar.write.setSubnameHook([subnames.address])

      await registerLabel(baseRegistrar, 'gen', registrantAccount.address)
      const node = namehash('gen.testing')
      expect(await subnames.read.generation([node])).toBe(0n)

      // expire + grace, then re-register to a different owner
      await connection.networkHelpers.time.increase(DURATION + 91n * DAY)
      await registerLabel(baseRegistrar, 'gen', otherAccount.address)

      expect(await subnames.read.generation([node])).toBe(1n)
    })
  })
})
