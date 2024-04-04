const { use, expect } = require('chai')
const { solidity } = require('ethereum-waffle')
const { ethers } = require('hardhat')
const { toUtf8Bytes } = require('ethers/lib/utils')

use(solidity)

const NULL_HASH =
  '0x0000000000000000000000000000000000000000000000000000000000000000'
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

describe('HexUtils', () => {
  let HexUtils

  before(async () => {
    const HexUtilsFactory = await ethers.getContractFactory('TestHexUtils')
    HexUtils = await HexUtilsFactory.deploy()
  })

  describe('hexToBytes()', () => {
    it('Converts a hex string to bytes', async () => {
      let [bytes32, valid] = await HexUtils.hexToBytes(
        toUtf8Bytes(
          '5cee339e13375638553bdf5a6e36ba80fb9f6a4f0783680884d92b558aa471da',
        ),
        0,
        64,
      )
      expect(valid).to.equal(true)
      expect(bytes32).to.equal(
        '0x5cee339e13375638553bdf5a6e36ba80fb9f6a4f0783680884d92b558aa471da',
      )
    })

    it('Handles short strings', async () => {
      let [bytes32, valid] = await HexUtils.hexToBytes(
        toUtf8Bytes('5cee'),
        0,
        4,
      )
      expect(valid).to.equal(true)
      expect(bytes32).to.equal('0x5cee')
    })

    it('Handles long strings', async () => {
      let [bytes32, valid] = await HexUtils.hexToBytes(
        toUtf8Bytes(
          '5cee339e13375638553bdf5a6e36ba80fb9f6a4f0783680884d92b558aa471da010203',
        ),
        0,
        70,
      )
      expect(valid).to.equal(true)
      expect(bytes32).to.equal(
        '0x5cee339e13375638553bdf5a6e36ba80fb9f6a4f0783680884d92b558aa471da010203',
      )
    })
  })

  describe('hexStringToBytes32()', () => {
    it('Converts a hex string to bytes32', async () => {
      let [bytes32, valid] = await HexUtils.hexStringToBytes32(
        toUtf8Bytes(
          '5cee339e13375638553bdf5a6e36ba80fb9f6a4f0783680884d92b558aa471da',
        ),
        0,
        64,
      )
      expect(valid).to.equal(true)
      expect(bytes32).to.equal(
        '0x5cee339e13375638553bdf5a6e36ba80fb9f6a4f0783680884d92b558aa471da',
      )
    })
    it('Uses the correct index to read from', async () => {
      let [bytes32, valid] = await HexUtils.hexStringToBytes32(
        toUtf8Bytes(
          'zzzzz0x5cee339e13375638553bdf5a6e36ba80fb9f6a4f0783680884d92b558aa471da',
        ),
        7,
        71,
      )
      expect(valid).to.equal(true)
      expect(bytes32).to.equal(
        '0x5cee339e13375638553bdf5a6e36ba80fb9f6a4f0783680884d92b558aa471da',
      )
    })
    it('Correctly parses all hex characters', async () => {
      let [bytes32, valid] = await HexUtils.hexStringToBytes32(
        toUtf8Bytes('0123456789abcdefABCDEF0123456789abcdefABCD'),
        0,
        40,
      )
      expect(valid).to.equal(true)
      expect(bytes32).to.equal(
        '0x0000000000000000000000000123456789abcdefabcdef0123456789abcdefab',
      )
    })
    it('Returns invalid when the string contains non-hex characters', async () => {
      const [bytes32, valid] = await HexUtils.hexStringToBytes32(
        toUtf8Bytes(
          'zcee339e13375638553bdf5a6e36ba80fb9f6a4f0783680884d92b558aa471da',
        ),
        0,
        64,
      )
      expect(valid).to.equal(false)
      expect(bytes32).to.equal(NULL_HASH)
    })
    it('Reverts when the string is too short', async () => {
      await expect(
        HexUtils.hexStringToBytes32(
          toUtf8Bytes(
            '5cee339e13375638553bdf5a6e36ba80fb9f6a4f0783680884d92b558aa471da',
          ),
          1,
          65,
        ),
      ).to.be.reverted
    })
  })

  describe('hexToAddress()', () => {
    it('Converts a hex string to an address', async () => {
      let [address, valid] = await HexUtils.hexToAddress(
        toUtf8Bytes(
          '5cee339e13375638553bdf5a6e36ba80fb9f6a4f0783680884d92b558aa471da',
        ),
        0,
        40,
      )
      expect(valid).to.equal(true)
      expect(address).to.equal('0x5ceE339e13375638553bdF5a6e36BA80fB9f6a4F')
    })
    it('Does not allow sizes smaller than 40 characters', async () => {
      let [address, valid] = await HexUtils.hexToAddress(
        toUtf8Bytes(
          '5cee339e13375638553bdf5a6e36ba80fb9f6a4f0783680884d92b558aa471da',
        ),
        0,
        39,
      )
      expect(valid).to.equal(false)
      expect(address).to.equal(ZERO_ADDRESS)
    })
  })

  describe('Special cases for hexStringToBytes32()', () => {
    const hex32Bytes =
      '5cee339e13375638553bdf5a6e36ba80fb9f6a4f0783680884d92b558aa471da'
    it('odd length 1', async () => {
      await expect(HexUtils.hexStringToBytes32(toUtf8Bytes(hex32Bytes), 0, 63))
        .to.be.reverted
    })

    it('odd length 2', async () => {
      await expect(
        HexUtils.hexStringToBytes32(toUtf8Bytes(hex32Bytes + '00'), 1, 64),
      ).to.be.reverted
    })

    it('exceed length', async () => {
      await expect(
        HexUtils.hexStringToBytes32(
          toUtf8Bytes(hex32Bytes + '1234'),
          0,
          64 + 4,
        ),
      ).to.be.reverted
    })
  })
})
