const DummyOracle = artifacts.require('./DummyOracle')
const StablePriceOracle = artifacts.require('./StablePriceOracle')

const { expect } = require('chai')

contract('StablePriceOracle', function (accounts) {
  let priceOracle

  before(async () => {
    // Dummy oracle with 1 ETH == 10 USD
    var dummyOracle = await DummyOracle.new(1000000000n)
    // 4 attousd per second for 3 character names, 2 attousd per second for 4 character names,
    // 1 attousd per second for longer names.
    priceOracle = await StablePriceOracle.new(
      dummyOracle.address,
      [0, 0, 4, 2, 1],
    )
  })

  it('should return correct prices', async () => {
    expect(parseInt((await priceOracle.price('foo', 0, 3600)).base)).to.equal(
      1440,
    )
    expect(parseInt((await priceOracle.price('quux', 0, 3600)).base)).to.equal(
      720,
    )
    expect(parseInt((await priceOracle.price('fubar', 0, 3600)).base)).to.equal(
      360,
    )
    expect(
      parseInt((await priceOracle.price('foobie', 0, 3600)).base),
    ).to.equal(360)

    expect(
      parseInt(
        (await priceOracle.price('foobie', 0, 60 * 60 * 24 * 365 * 1)).base,
      ),
    ).to.equal((60 * 60 * 24 * 365) / 10)
  })

  it('should return correct prices for longer durations', async () => {
    expect(
      parseInt(
        (await priceOracle.price('foobie', 0, 60 * 60 * 24 * 365 * 1)).base,
      ),
    ).to.equal((60 * 60 * 24 * 365) / 10)
  })

  it('should respected a progressive discount', async () => {
    const duration = 60 * 60 * 24 * 365 * 5 // 5 years
    const discountPercentage = 20 / 100
    expect(
      parseInt((await priceOracle.price('foobie', 0, duration)).base),
    ).to.equal(duration / 10 - (duration / 10) * discountPercentage)

    const duration2 = 60 * 60 * 24 * 365 * 12 // 5 years
    const discountPercentage2 = 50 / 100
    expect(
      parseInt((await priceOracle.price('foobie', 0, duration2)).base),
    ).to.equal(duration2 / 10 - (duration2 / 10) * discountPercentage2)
  })

  it('should work with larger values', async () => {
    const dummyOracle2 = await DummyOracle.new(1000000000n)
    // 4 attousd per second for 3 character names, 2 attousd per second for 4 character names,
    // 1 attousd per second for longer names.
    const priceOracle2 = await StablePriceOracle.new(dummyOracle2.address, [
      0,
      0,
      // 1 USD per second!
      1000000000000000000n,
      2,
      1,
    ])
    expect((await priceOracle2.price('foo', 0, 86400))[0].toString()).to.equal(
      '8640000000000000000000',
    )
  })
})
