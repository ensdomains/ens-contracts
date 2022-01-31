const ENS = artifacts.require('./registry/ENSRegistry')
const BaseRegistrar = artifacts.require('./BaseRegistrarImplementation')
const DummyOracle = artifacts.require('./DummyOracle')
const ExponentialPremiumPriceOracle = artifacts.require(
  './ExponentialPremiumPriceOracle'
)

const namehash = require('eth-ens-namehash')
const sha3 = require('web3-utils').sha3
const toBN = require('web3-utils').toBN

const DAY = 86400

describe.only('ExponentialPricePremiumOracle Tests', () => {
  contract('ExponentialPricePremiumOracle', function(accounts) {
    let priceOracle

    before(async () => {
      ens = await ENS.new()
      registrar = await BaseRegistrar.new(ens.address, namehash.hash('eth'))
      await ens.setSubnodeOwner('0x0', sha3('eth'), registrar.address)
      await registrar.addController(accounts[0])

      // Dummy oracle with 1 ETH == 2 USD
      var dummyOracle = await DummyOracle.new(toBN(200000000))
      // 4 attousd per second for 3 character names, 2 attousd per second for 4 character names,
      // 1 attousd per second for longer names.
      // Pricing premium starts out at 100 USD at expiry and decreases to 0 over 100k seconds (a bit over a day)
      const premium = toBN('100000000000000000000')
      const decreaseRate = toBN('1000000000000000')
      priceOracle = await ExponentialPremiumPriceOracle.new(
        dummyOracle.address,
        [0, 0, 4, 2, 1]
      )
    })

    it('should return correct base prices', async () => {
      assert.equal((await priceOracle.price('foo', 0, 3600)).toNumber(), 7200)
      assert.equal((await priceOracle.price('quux', 0, 3600)).toNumber(), 3600)
      assert.equal((await priceOracle.price('fubar', 0, 3600)).toNumber(), 1800)
      assert.equal(
        (await priceOracle.price('foobie', 0, 3600)).toNumber(),
        1800
      )
    })

    it('should not specify a premium for first-time registrations', async () => {
      assert.equal((await priceOracle.premium('foobar', 0, 0)).toNumber(), 0)
      assert.equal((await priceOracle.price('foobar', 0, 0)).toNumber(), 0)
    })

    it('should not specify a premium for renewals', async () => {
      const ts = (await web3.eth.getBlock('latest')).timestamp
      assert.equal((await priceOracle.premium('foobar', ts, 0)).toNumber(), 0)
      assert.equal((await priceOracle.price('foobar', ts, 0)).toNumber(), 0)
    })

    it('should specify the maximum premium at the moment of expiration', async () => {
      const ts = (await web3.eth.getBlock('latest')).timestamp - 90 * DAY
      console.log(
        'price in wei',
        (await priceOracle.premium('foobar', ts, 0)).toString()
      )
      assert.equal(
        (await priceOracle.premium('foobar', ts, 0)).toString(),
        500000 * 1e18 // 500k ETH in wei
      )
      assert.equal(
        (await priceOracle.price('foobar', ts, 0)).toString(),
        500000 * 1e18
      )
    })

    it('should specify half the premium after half the interval', async () => {
      const ts =
        (await web3.eth.getBlock('latest')).timestamp - (90 * DAY + DAY * 2.5)
      assert.equal(
        (Number(await priceOracle.premium('foobar', ts, 0)) / 1e18).toFixed(2),
        (176776.69 / 2).toFixed(2)
      )
      assert.equal(
        (Number(await priceOracle.price('foobar', ts, 0)) / 1e18).toFixed(2),
        (176776.69 / 2).toFixed(2)
      )
    })

    it('should specify the correct price after 2.5 days and 1 year registration', async () => {
      const ts =
        (await web3.eth.getBlock('latest')).timestamp - (90 * DAY + DAY * 2.5)
      const lengthOfRegistration = DAY * 365
      assert.equal(
        (
          Number(
            await priceOracle.premium('foobar', ts, lengthOfRegistration)
          ) / 1e18
        ).toFixed(2),
        (176776.69 / 2).toFixed(2)
      )
      assert.equal(
        (
          Number(await priceOracle.price('foobar', ts, lengthOfRegistration)) /
          1e18
        ).toFixed(2),
        (176776.69 / 2).toFixed(2)
      )
    })

    it('should not be beyond a certain amount of inaccuracy from floating point calc', async () => {
      function exponentialReduceFloatingPoint(startPrice, days) {
        return startPrice * 0.5 ** days
      }
      let ts = (await web3.eth.getBlock('latest')).timestamp - 90 * DAY
      let differencePercentSum = 0
      let percentMax = 0

      const offset = 0
      console.log(offset)
      console.time()
      for (let i = 0; i <= 86400 * 28; i += 60) {
        const contractResult =
          Number(await priceOracle.premium('foobar', ts - i + offset, 0)) / 1e18

        const jsResult =
          exponentialReduceFloatingPoint(1000000, (i + offset) / 86400) / 2
        const percent = (Math.abs(contractResult - jsResult) / jsResult) * 100
        if (percent > percentMax) {
          percentMax = percent
        }
        differencePercentSum += percent
      }
      console.timeEnd()
      console.log('absolute max', absoluteMax)
      console.log('percent max', percentMax)
      console.log('percent avg', differencePercentSum / ((86400 * 28) / 60))
    })
  })
})
