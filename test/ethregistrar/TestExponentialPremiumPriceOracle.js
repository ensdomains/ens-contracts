const { expect } = require('chai')
const namehash = require('eth-ens-namehash')
const sha3 = require('web3-utils').sha3
const toBN = require('web3-utils').toBN

const ENS = artifacts.require('./registry/ENSRegistry')
const BaseRegistrar = artifacts.require('./BaseRegistrarImplementation')
const DummyOracle = artifacts.require('./DummyOracle')
const ExponentialPremiumPriceOracle = artifacts.require(
  './ExponentialPremiumPriceOracle'
)

const LAST_VALUE = 372529029846191400 / 1e18
const DAY = 86400
function exponentialReduceFloatingPoint(startPrice, days) {
  const premium = startPrice * 0.5 ** days
  if (premium > LAST_VALUE) {
    return premium - LAST_VALUE
  }
  return 0
}
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
      const expectedPrice = ((100000000 - LAST_VALUE) / 2) * 1e18 // ETH at $2 for $1 mil in 18 decimal precision
      console.log(
        'price in wei',
        (await priceOracle.premium('foobar', ts, 0)).toString()
      )
      assert.equal(
        (await priceOracle.premium('foobar', ts, 0)).toString(),
        expectedPrice
      )
      assert.equal(
        (await priceOracle.price('foobar', ts, 0)).toString(),
        expectedPrice
      )
    })

    it('should specify the correct price after 2.5 days and 1 year registration', async () => {
      const ts =
        (await web3.eth.getBlock('latest')).timestamp - (90 * DAY + DAY * 2.5)
      const lengthOfRegistration = DAY * 365
      const expectedPremium = (
        exponentialReduceFloatingPoint(100000000, 2.5) / 2
      ).toFixed(2)

      expect(
        (
          Number(
            await priceOracle.premium('foobar', ts, lengthOfRegistration)
          ) / 1e18
        ).toFixed(2)
      ).to.equal(expectedPremium)

      expect(
        (
          Number(await priceOracle.price('foobar', ts, lengthOfRegistration)) /
          1e18
        ).toFixed(2)
      ).to.equal(expectedPremium)
    })

    // This test only runs every hour of each day. For an exhaustive test use the exponentialPremiumScript and uncomment the exhaustive test below
    it('should not be beyond a certain amount of inaccuracy from floating point calc', async () => {
      let ts = (await web3.eth.getBlock('latest')).timestamp - 90 * DAY
      let differencePercentSum = 0
      let percentMax = 0

      const interval = 3600 // 1 hour

      const offset = 0
      let j
      for (let i = 0; i <= 86400 * 29; i += interval) {
        const contractResult =
          Number(await priceOracle.premium('foobar', ts - (i + offset), 0)) /
          1e18

        const jsResult =
          exponentialReduceFloatingPoint(100000000, (i + offset) / 86400) / 2
        let percent = 0
        if (contractResult !== 0) {
          percent = Math.abs(contractResult - jsResult) / jsResult
        }
        if (percent > percentMax) {
          percentMax = percent
        }
        if (i >= 2419200) {
          // after or at 28 days premium should be 0
          expect(contractResult).to.equal(0)
          expect(jsResult).to.equal(0)
        }
        differencePercentSum += percent
      }

      expect(percentMax).to.be.below(0.001) // must be less than 0.1% off JS implementation
    })
  })

  //   it('should not be beyond a certain amount of inaccuracy from floating point calc (exhaustive)', async () => {
  //     function exponentialReduceFloatingPoint(startPrice, days) {
  //       return startPrice * 0.5 ** days
  //     }
  //     let ts = (await web3.eth.getBlock('latest')).timestamp - 90 * DAY
  //     let differencePercentSum = 0
  //     let percentMax = 0

  //     const offset = parseInt(process.env.OFFSET)
  //     console.log(offset)
  //     console.time()
  //     for (let i = 0; i <= 86400 * 28; i += 60) {
  //       const contractResult =
  //         Number(await priceOracle.premium('foobar', ts - (i + offset), 0)) /
  //         1e18

  //       const jsResult =
  //         exponentialReduceFloatingPoint(1000000, (i + offset) / 86400) / 2
  //       const percent = Math.abs(contractResult - jsResult) / jsResult
  //       if (percent > percentMax) {
  //         console.log({ percent, i, contractResult, jsResult })
  //         percentMax = percent
  //       }
  //       differencePercentSum += percent
  //     }
  //     console.timeEnd()
  //     fs.writeFileSync(
  //       `stats-${offset}.csv`,
  //       `${percentMax},${differencePercentSum / ((86400 * 28) / 60)}\n`
  //     )
  //     console.log('percent max', percentMax)
  //     console.log('percent avg', differencePercentSum / ((86400 * 28) / 60))
  //   })
  // })
})
