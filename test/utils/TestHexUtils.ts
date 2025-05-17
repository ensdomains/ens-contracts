import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import hre from 'hardhat'
import { type Hex, stringToHex, toHex, zeroAddress, zeroHash } from 'viem'

async function fixture() {
  return hre.viem.deployContract('TestHexUtils')
}

function unprefixedHexStr(length: number) {
  return Array.from({ length }, (_, i) =>
    ((i + length) & 15).toString(16),
  ).join('')
}

describe('HexUtils', () => {
  describe('hexToBytes()', () => {
    for (let n = 0; n <= 65; n++) {
      const raw = unprefixedHexStr(n)
      const hex = (n & 1 ? `0x0${raw}` : `0x${raw}`) as Hex
      it(`0x${raw}`, async () => {
        const F = await loadFixture(fixture)
        await expect(
          F.read.hexToBytes([stringToHex(raw), 0n, BigInt(n)]),
        ).resolves.toStrictEqual([hex, true])
      })
    }
  })

  describe('hexStringToBytes32()', () => {
    for (let n = 0; n <= 64; n++) {
      const raw = unprefixedHexStr(n)
      const hex = ('0x' + raw.padStart(64, '0')) as Hex
      it(`0x${raw}`, async () => {
        const F = await loadFixture(fixture)
        await expect(
          F.read.hexStringToBytes32([stringToHex(raw), 0n, BigInt(n)]),
        ).resolves.toStrictEqual([hex, true])
      })
    }

    it('uses the correct index to read from', async () => {
      const F = await loadFixture(fixture)
      await expect(
        F.read.hexStringToBytes32([
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
      const F = await loadFixture(fixture)
      await expect(
        F.read.hexStringToBytes32([
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
      const F = await loadFixture(fixture)
      await expect(
        F.read.hexStringToBytes32([
          stringToHex(
            'zcee339e13375638553bdf5a6e36ba80fb9f6a4f0783680884d92b558aa471da',
          ),
          0n,
          64n,
        ]),
      ).resolves.toMatchObject([zeroHash, false])
    })

    it('invalid when the string is too short', async () => {
      const F = await loadFixture(fixture)
      await expect(
        F.read.hexStringToBytes32([stringToHex('abcd'), 0n, 64n]),
      ).resolves.toMatchObject([zeroHash, false])
    })

    it('invalid when the string is too long', async () => {
      const F = await loadFixture(fixture)
      await expect(
        F.read.hexStringToBytes32([
          stringToHex(
            '5cee339e13375638553bdf5a6e36ba80fb9f6a4f0783680884d92b558aa471da',
          ),
          0n,
          64n + 4n,
        ]),
      ).resolves.toMatchObject([zeroHash, false])
    })
  })

  describe('hexToAddress()', async () => {
    it('converts a hex string to an address', async () => {
      const F = await loadFixture(fixture)
      await expect(
        F.read.hexToAddress([
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
      const F = await loadFixture(fixture)
      await expect(
        F.read.hexToAddress([
          stringToHex(
            '5cee339e13375638553bdf5a6e36ba80fb9f6a4f0783680884d92b558aa471da',
          ),
          0n,
          39n,
        ]),
      ).resolves.toMatchObject([zeroAddress, false])
    })

    it('does not allow sizes larger than 40 characters', async () => {
      const F = await loadFixture(fixture)
      await expect(
        F.read.hexToAddress([
          stringToHex(
            '5cee339e13375638553bdf5a6e36ba80fb9f6a4f0783680884d92b558aa471da',
          ),
          0n,
          41n,
        ]),
      ).resolves.toMatchObject([zeroAddress, false])
    })
  })

  describe('addressToHex()', async () => {
    for (const addr of [
      zeroAddress,
      '0x5ceE339e13375638553bdF5a6e36BA80fB9f6a4F',
      '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    ] as const) {
      it(addr, async () => {
        const F = await loadFixture(fixture)
        await expect(F.read.addressToHex([addr])).resolves.toStrictEqual(
          addr.slice(2).toLowerCase(),
        )
      })
    }
  })

  describe('bytesToHex()', async () => {
    for (let n = 0; n <= 33; n++) {
      const data = toHex(Uint8Array.from({ length: n }, (_, i) => n + i))
      it(data, async () => {
        const F = await loadFixture(fixture)
        await expect(F.read.bytesToHex([data])).resolves.toStrictEqual(
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
        const F = await loadFixture(fixture)
        await expect(
          F.read.unpaddedUintToHex([uint, true]),
          'true',
        ).resolves.toStrictEqual(hex)
        await expect(
          F.read.unpaddedUintToHex([uint, false]),
          'false',
        ).resolves.toStrictEqual(hex.length & 1 ? `0${hex}` : hex)
      })
    }
  })
})
