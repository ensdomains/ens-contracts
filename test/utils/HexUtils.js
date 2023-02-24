const { use, expect } = require('chai')
const { solidity } = require('ethereum-waffle')
const { ethers } = require('hardhat')
const { toUtf8Bytes } = require('ethers/lib/utils')

use(solidity)

const NULL_HASH =
  '0x0000000000000000000000000000000000000000000000000000000000000000'

describe('HexUtils', () => {
  let HexUtils

  before(async () => {
    const HexUtilsFactory = await ethers.getContractFactory('TestHexUtils')
    HexUtils = await HexUtilsFactory.deploy()
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
      expect(bytes32).to.equal(
        '0x5cee339e13375638553bdf5a6e36ba80fb9f6a4f0783680884d92b558aa471da',
      )
      expect(valid).to.equal(true)
    })
    it('Uses the correct index to read from', async () => {
      let [bytes32, valid] = await HexUtils.hexStringToBytes32(
        toUtf8Bytes(
          'zzzzz0x5cee339e13375638553bdf5a6e36ba80fb9f6a4f0783680884d92b558aa471da',
        ),
        7,
        71,
      )
      expect(bytes32).to.equal(
        '0x5cee339e13375638553bdf5a6e36ba80fb9f6a4f0783680884d92b558aa471da',
      )
      expect(valid).to.equal(true)
    })
    it('Correctly parses all hex characters', async () => {
      let [bytes32, valid] = await HexUtils.hexStringToBytes32(
        toUtf8Bytes('0123456789abcdefABCDEF'),
        0,
        22,
      )
      expect(bytes32).to.equal(
        '0x0000000000000000000000000000000000000000000123456789abcdefabcdef',
      )
      expect(valid).to.equal(true)
    })
    it('Returns invalid when the string contains non-hex characters', async () => {
      const [bytes32, valid] = await HexUtils.hexStringToBytes32(
        toUtf8Bytes(
          'zcee339e13375638553bdf5a6e36ba80fb9f6a4f0783680884d92b558aa471da',
        ),
        0,
        64,
      )
      expect(bytes32).to.equal(NULL_HASH)
      expect(valid).to.equal(false)
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
      expect(address).to.equal('0x5ceE339e13375638553bdF5a6e36BA80fB9f6a4F')
      expect(valid).to.equal(true)
    })
    it('Does not allow sizes smaller than 40 characters', async () => {
      let [address, valid] = await HexUtils.hexToAddress(
        toUtf8Bytes(
          '5cee339e13375638553bdf5a6e36ba80fb9f6a4f0783680884d92b558aa471da',
        ),
        0,
        39,
      )
      expect(address).to.equal('0x0000000000000000000000000000000000000000')
      expect(valid).to.equal(false)
    })
  })
})
