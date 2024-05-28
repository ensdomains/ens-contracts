import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import hre from 'hardhat'
import { labelhash, namehash, zeroHash } from 'viem'
import { dnsEncodeName } from '../fixtures/dnsEncodeName.js'

async function fixture() {
  const bytesUtils = await hre.viem.deployContract(
    'contracts/utils/TestBytesUtils.sol:TestBytesUtils',
    [],
  )

  return { bytesUtils }
}

describe('BytesUtils', () => {
  describe('readLabel()', () => {
    it('reads the first label from a name', async () => {
      const { bytesUtils } = await loadFixture(fixture)

      await expect(
        bytesUtils.read.readLabel([dnsEncodeName('test.tld'), 0n]),
      ).resolves.toMatchObject([labelhash('test'), 5n])
    })

    it('reads subsequent labels from a name', async () => {
      const { bytesUtils } = await loadFixture(fixture)

      await expect(
        bytesUtils.read.readLabel([dnsEncodeName('test.tld'), 5n]),
      ).resolves.toMatchObject([labelhash('tld'), 9n])
    })

    it('reads the terminator from a name', async () => {
      const { bytesUtils } = await loadFixture(fixture)

      await expect(
        bytesUtils.read.readLabel([dnsEncodeName('test.tld'), 9n]),
      ).resolves.toMatchObject([zeroHash, 10n])
    })

    it('reverts when given an empty string', async () => {
      const { bytesUtils } = await loadFixture(fixture)

      await expect(bytesUtils)
        .read('readLabel', ['0x', 0n])
        .toBeRevertedWithString('readLabel: Index out of bounds')
    })

    it('reverts when given an index after the end of the string', async () => {
      const { bytesUtils } = await loadFixture(fixture)

      await expect(bytesUtils)
        .read('readLabel', [dnsEncodeName('test.tld'), 10n])
        .toBeRevertedWithString('readLabel: Index out of bounds')
    })
  })

  describe('namehash()', () => {
    it('hashes the empty name to 0', async () => {
      const { bytesUtils } = await loadFixture(fixture)

      await expect(
        bytesUtils.read.namehash([dnsEncodeName('.'), 0n]),
      ).resolves.toEqual(namehash(''))
    })

    it('hashes .eth correctly', async () => {
      const { bytesUtils } = await loadFixture(fixture)

      await expect(
        bytesUtils.read.namehash([dnsEncodeName('eth'), 0n]),
      ).resolves.toEqual(namehash('eth'))
    })

    it('hashes a 2LD correctly', async () => {
      const { bytesUtils } = await loadFixture(fixture)

      await expect(
        bytesUtils.read.namehash([dnsEncodeName('test.tld'), 0n]),
      ).resolves.toEqual(namehash('test.tld'))
    })

    it('hashes partial names correctly', async () => {
      const { bytesUtils } = await loadFixture(fixture)

      await expect(
        bytesUtils.read.namehash([dnsEncodeName('test.tld'), 5n]),
      ).resolves.toEqual(namehash('tld'))
    })
  })
})
