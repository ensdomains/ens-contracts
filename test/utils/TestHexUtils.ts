import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import hre from 'hardhat'
import { stringToHex, toHex, zeroAddress, zeroHash } from 'viem'

async function fixture() {
  const hexUtils = await hre.viem.deployContract('TestHexUtils', [])

  return { hexUtils }
}

describe('HexUtils', () => {
  describe('hexToBytes()', () => {
    it('converts a hex string to bytes', async () => {
      const { hexUtils } = await loadFixture(fixture)

      await expect(
        hexUtils.read.hexToBytes([
          stringToHex(
            '5cee339e13375638553bdf5a6e36ba80fb9f6a4f0783680884d92b558aa471da',
          ),
          0n,
          64n,
        ]),
      ).resolves.toMatchObject([
        '0x5cee339e13375638553bdf5a6e36ba80fb9f6a4f0783680884d92b558aa471da',
        true,
      ])
    })

    it('handles short strings', async () => {
      const { hexUtils } = await loadFixture(fixture)

      await expect(
        hexUtils.read.hexToBytes([stringToHex('5cee'), 0n, 4n]),
      ).resolves.toMatchObject(['0x5cee', true])
    })

    it('handles long strings', async () => {
      const { hexUtils } = await loadFixture(fixture)

      await expect(
        hexUtils.read.hexToBytes([
          stringToHex(
            '5cee339e13375638553bdf5a6e36ba80fb9f6a4f0783680884d92b558aa471da010203',
          ),
          0n,
          70n,
        ]),
      ).resolves.toMatchObject([
        '0x5cee339e13375638553bdf5a6e36ba80fb9f6a4f0783680884d92b558aa471da010203',
        true,
      ])
    })
  })

  describe('hexStringToBytes32()', () => {
    it('converts a hex string to bytes32', async () => {
      const { hexUtils } = await loadFixture(fixture)

      await expect(
        hexUtils.read.hexStringToBytes32([
          stringToHex(
            '5cee339e13375638553bdf5a6e36ba80fb9f6a4f0783680884d92b558aa471da',
          ),
          0n,
          64n,
        ]),
      ).resolves.toMatchObject([
        '0x5cee339e13375638553bdf5a6e36ba80fb9f6a4f0783680884d92b558aa471da',
        true,
      ])
    })

    it('uses the correct index to read from', async () => {
      const { hexUtils } = await loadFixture(fixture)

      await expect(
        hexUtils.read.hexStringToBytes32([
          stringToHex(
            'zzzzz0x5cee339e13375638553bdf5a6e36ba80fb9f6a4f0783680884d92b558aa471da',
          ),
          7n,
          71n,
        ]),
      ).resolves.toMatchObject([
        '0x5cee339e13375638553bdf5a6e36ba80fb9f6a4f0783680884d92b558aa471da',
        true,
      ])
    })

    it('correctly parses all the hex characters', async () => {
      const { hexUtils } = await loadFixture(fixture)

      await expect(
        hexUtils.read.hexStringToBytes32([
          stringToHex('0123456789abcdefABCDEF0123456789abcdefABCD'),
          0n,
          40n,
        ]),
      ).resolves.toMatchObject([
        '0x0000000000000000000000000123456789abcdefabcdef0123456789abcdefab',
        true,
      ])
    })

    it('returns invalid when the string contains non-hex characters', async () => {
      const { hexUtils } = await loadFixture(fixture)

      await expect(
        hexUtils.read.hexStringToBytes32([
          stringToHex(
            'zcee339e13375638553bdf5a6e36ba80fb9f6a4f0783680884d92b558aa471da',
          ),
          0n,
          64n,
        ]),
      ).resolves.toMatchObject([zeroHash, false])
    })

    it('reverts when the string is too short', async () => {
      const { hexUtils } = await loadFixture(fixture)

      await expect(hexUtils)
        .read('hexStringToBytes32', [
          stringToHex(
            '5cee339e13375638553bdf5a6e36ba80fb9f6a4f0783680884d92b558aa471da',
          ),
          1n,
          65n,
        ])
        .toBeRevertedWithoutReason()
    })
  })

  describe('hexToAddress()', async () => {
    it('converts a hex string to an address', async () => {
      const { hexUtils } = await loadFixture(fixture)

      await expect(
        hexUtils.read.hexToAddress([
          stringToHex(
            '5cee339e13375638553bdf5a6e36ba80fb9f6a4f0783680884d92b558aa471da',
          ),
          0n,
          40n,
        ]),
      ).resolves.toMatchObject([
        '0x5ceE339e13375638553bdF5a6e36BA80fB9f6a4F',
        true,
      ])
    })

    it('does not allow sizes smaller than 40 characters', async () => {
      const { hexUtils } = await loadFixture(fixture)

      await expect(
        hexUtils.read.hexToAddress([
          stringToHex(
            '5cee339e13375638553bdf5a6e36ba80fb9f6a4f0783680884d92b558aa471da',
          ),
          0n,
          39n,
        ]),
      ).resolves.toMatchObject([zeroAddress, false])
    })
  })

  describe('special cases for hexStringToBytes32()', () => {
    const hex32Bytes =
      '5cee339e13375638553bdf5a6e36ba80fb9f6a4f0783680884d92b558aa471da'

    it('odd length 1', async () => {
      const { hexUtils } = await loadFixture(fixture)

      await expect(hexUtils)
        .read('hexStringToBytes32', [stringToHex(hex32Bytes), 0n, 63n])
        .toBeRevertedWithString('Invalid string length')
    })

    it('odd length 2', async () => {
      const { hexUtils } = await loadFixture(fixture)

      await expect(hexUtils)
        .read('hexStringToBytes32', [stringToHex(hex32Bytes + '00'), 1n, 64n])
        .toBeRevertedWithString('Invalid string length')
    })

    it('exceed length', async () => {
      const { hexUtils } = await loadFixture(fixture)

      await expect(hexUtils)
        .read('hexStringToBytes32', [
          stringToHex(hex32Bytes + '1234'),
          0n,
          64n + 4n,
        ])
        .toBeRevertedWithoutReason()
    })
  })

  describe('addressToHex()', async () => {
    for (const addr of [
      zeroAddress,
      '0x5ceE339e13375638553bdF5a6e36BA80fB9f6a4F',
      '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    ] as const) {
      it(addr, async () => {
        const { hexUtils } = await loadFixture(fixture)
        await expect(hexUtils.read.addressToHex([addr])).resolves.toStrictEqual(
          addr.slice(2).toLowerCase(),
        )
      })
    }
  })

  describe('bytesToHex()', async () => {
    for (let n = 0; n <= 33; n++) {
      const data = toHex(Uint8Array.from({ length: n }, (_, i) => n + i))
      it(data, async () => {
        const { hexUtils } = await loadFixture(fixture)
        await expect(hexUtils.read.bytesToHex([data])).resolves.toStrictEqual(
          data.slice(2),
        )
      })
    }
  })

  describe('unpaddedUintToHex()', async () => {
    for (let n = 0; n <= 32; n++) {
      const uint = (1n << BigInt(n << 3)) - 1n
      const hex = uint.toString(16)
      it(`0x${hex}`, async () => {
        const { hexUtils } = await loadFixture(fixture)
        await expect(
          hexUtils.read.unpaddedUintToHex([uint, true]),
          'true',
        ).resolves.toStrictEqual(hex)
        await expect(
          hexUtils.read.unpaddedUintToHex([uint, false]),
          'false',
        ).resolves.toStrictEqual(hex.length & 1 ? `0${hex}` : hex)
      })
    }
  })
})
