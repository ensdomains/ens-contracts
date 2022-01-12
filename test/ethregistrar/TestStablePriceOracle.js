const ENS = artifacts.require('./registry/ENSRegistry')
const BaseRegistrar = artifacts.require('./BaseRegistrarImplementation')
const DummyOracle = artifacts.require('./DummyOracle')
const StablePriceOracle = artifacts.require('./StablePriceOracle')

const namehash = require('eth-ens-namehash')
const sha3 = require('web3-utils').sha3
const { use, expect } = require('chai')

describe('Contract', () => {
  contract('StablePriceOracle', function(accounts) {
    let priceOracle

    before(async () => {
      ens = await ENS.new()
      registrar = await BaseRegistrar.new(ens.address, namehash.hash('eth'))

      // Dummy oracle with 1 ETH == 10 USD
      var dummyOracle = await DummyOracle.new(1000000000n)
      // 4 attousd per second for 3 character names, 2 attousd per second for 4 character names,
      // 1 attousd per second for longer names.
      priceOracle = await StablePriceOracle.new(dummyOracle.address, [
        0,
        0,
        4,
        2,
        1,
      ])
    })

    it('should return correct prices', async () => {
      assert.equal(
        (await priceOracle.price('foo', 0, 3600))[0].toNumber(),
        1440
      )
      assert.equal(
        (await priceOracle.price('quux', 0, 3600))[0].toNumber(),
        720
      )
      assert.equal(
        (await priceOracle.price('fubar', 0, 3600))[0].toNumber(),
        360
      )
      assert.equal(
        (await priceOracle.price('foobie', 0, 3600))[0].toNumber(),
        360
      )
    })

    // string calldata name,
    //     uint256 expires,
    //     uint256 value

    it('should return correct duration', async () => {
      expect(
        (await priceOracle.duration('foo', 1, 1000000n))[0].toNumber()
      ).to.equal(25000)

      expect(
        (await priceOracle.duration('quux', 1, 1000000n))[0].toNumber()
      ).to.equal(50000)

      expect(
        (await priceOracle.duration('fubar', 1, 1000000n))[0].toNumber()
      ).to.equal(100000)

      expect(
        (await priceOracle.duration('foobie', 1, 1000000n))[0].toNumber()
      ).to.equal(100000)
    })

    // it('should work with larger values', async () => {
    //   // 1 USD per second!
    //   await priceOracle.setPrices([toBN('1000000000000000000')])
    //   assert.equal(
    //     (await priceOracle.price('foo', 0, 86400))[0].toString(),
    //     '8640000000000000000000'
    //   )
    // })
  })
})
