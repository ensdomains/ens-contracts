import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import hre from 'hardhat'
import { labelhash, namehash, zeroHash } from 'viem'

const FACTOR = 10n ** 18n
const START_PRICE = 100000000
const START_PRICE_WITH_FACTOR = BigInt(START_PRICE) * FACTOR
const DAY = 86400n
const LAST_DAY = 21n

const HALVING_DIVISOR = 2n ** LAST_DAY

const LAST_VALUE = START_PRICE * 0.5 ** Number(LAST_DAY)
const LAST_VALUE_WITH_FACTOR = START_PRICE_WITH_FACTOR / HALVING_DIVISOR

function exponentialReduceFloatingPoint(startPrice: number, days: number) {
  const premium = startPrice * 0.5 ** days
  if (premium >= LAST_VALUE) {
    return premium - Number(LAST_VALUE)
  }
  return 0
}

async function fixture() {
  const publicClient = await hre.viem.getPublicClient()
  const accounts = await hre.viem
    .getWalletClients()
    .then((clients) => clients.map((c) => c.account))
  const ensRegistry = await hre.viem.deployContract('ENSRegistry', [])
  const baseRegistrar = await hre.viem.deployContract(
    'BaseRegistrarImplementation',
    [ensRegistry.address, namehash('eth')],
  )

  await baseRegistrar.write.addController([accounts[0].address])
  await ensRegistry.write.setSubnodeOwner([
    zeroHash,
    labelhash('eth'),
    baseRegistrar.address,
  ])

  // Dummy oracle with 1 ETH == 2 USD
  const dummyOracle = await hre.viem.deployContract('DummyOracle', [200000000n])
  // 4 attousd per second for 3 character names, 2 attousd per second for 4 character names,
  // 1 attousd per second for longer names.
  // Pricing premium starts out at 100 USD at expiry and decreases to 0 over 100k seconds (a bit over a day)
  const priceOracle = await hre.viem.deployContract(
    'ExponentialPremiumPriceOracle',
    [
      dummyOracle.address,
      [0n, 0n, 4n, 2n, 1n],
      START_PRICE_WITH_FACTOR,
      LAST_DAY,
    ],
  )

  return { ensRegistry, baseRegistrar, priceOracle, publicClient, accounts }
}

describe('ExponentialPremiumPriceOracle', () => {
  it('should return correct base prices', async () => {
    const { priceOracle } = await loadFixture(fixture)
    await expect(
      priceOracle.read.price(['foo', 0n, 3600n]),
    ).resolves.toHaveProperty('base', 7200n)
    await expect(
      priceOracle.read.price(['quux', 0n, 3600n]),
    ).resolves.toHaveProperty('base', 3600n)
    await expect(
      priceOracle.read.price(['fubar', 0n, 3600n]),
    ).resolves.toHaveProperty('base', 1800n)
    await expect(
      priceOracle.read.price(['foobie', 0n, 3600n]),
    ).resolves.toHaveProperty('base', 1800n)
  })

  it('should not specify a premium for first-time registrations', async () => {
    const { priceOracle } = await loadFixture(fixture)
    await expect(priceOracle.read.premium(['foobar', 0n, 0n])).resolves.toEqual(
      0n,
    )
    await expect(
      priceOracle.read.price(['foobar', 0n, 0n]),
    ).resolves.toHaveProperty('base', 0n)
  })

  it('should not specify a premium for renewals', async () => {
    const { priceOracle, publicClient } = await loadFixture(fixture)
    const timestamp = await publicClient.getBlock().then((b) => b.timestamp)
    await expect(
      priceOracle.read.premium(['foobar', timestamp, 0n]),
    ).resolves.toEqual(0n)
    await expect(
      priceOracle.read.price(['foobar', timestamp, 0n]),
    ).resolves.toHaveProperty('base', 0n)
  })

  it('should specify the maximum premium at the moment of expiration', async () => {
    const { priceOracle, publicClient } = await loadFixture(fixture)
    const timestamp = await publicClient
      .getBlock()
      .then((b) => b.timestamp - 90n * BigInt(DAY))
    const expectedPrice =
      (START_PRICE_WITH_FACTOR - LAST_VALUE_WITH_FACTOR) / 2n // ETH at $2 for $1 mil in 18 decimal precision
    await expect(
      priceOracle.read.premium(['foobar', timestamp, 0n]),
    ).resolves.toEqual(expectedPrice)
    await expect(
      priceOracle.read.price(['foobar', timestamp, 0n]),
    ).resolves.toHaveProperty('premium', expectedPrice)
  })

  it('should specify the correct price after 2.5 days and 1 year registration', async () => {
    const { priceOracle, publicClient } = await loadFixture(fixture)
    const timestamp = await publicClient
      .getBlock()
      .then((b) => b.timestamp - (90n * DAY + 2n * DAY + DAY / 2n))
    const lengthOfRegistration = DAY * 365n
    const expectedPremium = (
      exponentialReduceFloatingPoint(START_PRICE, 2.5) / 2
    ).toPrecision(15)

    await expect(
      priceOracle.read
        .premium(['foobar', timestamp, lengthOfRegistration])
        .then((p) => (Number(p) / 1e18).toPrecision(15)),
    ).resolves.toEqual(expectedPremium)

    await expect(
      priceOracle.read
        .price(['foobar', timestamp, lengthOfRegistration])
        .then((p) => (Number(p.premium) / 1e18).toPrecision(15)),
    ).resolves.toEqual(expectedPremium)
  })

  it('should produce a 0 premium at the end of the decay period', async () => {
    const { priceOracle, publicClient } = await loadFixture(fixture)
    const timestamp = await publicClient
      .getBlock()
      .then((b) => b.timestamp - 90n * DAY)

    await expect(
      priceOracle.read.premium(['foobar', timestamp - LAST_DAY * DAY + 1n, 0n]),
    ).resolves.toBeGreaterThan(0n)
    await expect(
      priceOracle.read.premium(['foobar', timestamp - LAST_DAY * DAY, 0n]),
    ).resolves.toEqual(0n)
  })

  // This test only runs every hour of each day. For an exhaustive test use the exponentialPremiumScript and uncomment the exhaustive test below
  it('should not be beyond a certain amount of inaccuracy from floating point calc', async () => {
    const { priceOracle, publicClient } = await loadFixture(fixture)
    const timestamp = await publicClient
      .getBlock()
      .then((b) => b.timestamp - 90n * DAY)

    const interval = 3600 // 1 hour
    const result = await Promise.all(
      Array.from({ length: Number(DAY * LAST_DAY) / interval }).map(
        async (_, i) => {
          const seconds = i * interval
          const time = timestamp - BigInt(seconds)
          const contractResult = await priceOracle.read
            .premium(['foobar', time, 0n])
            .then((p) => Number(p) / 1e18)

          const jsResult =
            exponentialReduceFloatingPoint(START_PRICE, seconds / 86400) / 2

          if (contractResult === 0) return { percent: 0, absoluteDifference: 0 }
          const absoluteDifference = Math.abs(contractResult - jsResult)
          const percent = absoluteDifference / jsResult
          return { percent, absoluteDifference }
        },
      ),
    ).then((results) =>
      results.reduce(
        (prev, curr) => {
          // discounts absolute differences of less than 1c
          if (
            curr.percent > prev.percentMax &&
            curr.absoluteDifference > 0.01
          ) {
            prev.percentMax = curr.percent
          }
          prev.differencePercentSum += curr.percent
          return prev
        },
        { percentMax: 0, differencePercentSum: 0 },
      ),
    )

    expect(result.percentMax).toBeLessThan(0.001) // must be less than 0.1% off JS implementation on an hourly resolution
  })

  /***
   * Exhaustive tests
   * In the exhaustive tests, the last few mins, the absolute difference between JS and Solidity will creep up.
   * And specifically the last few seconds go up to 31% difference. However the absolute difference is in the fractions
   * and therefore can be discounted
   */

  // it('should not be beyond a certain amount of inaccuracy from floating point calc (exhaustive)', async () => {
  //   function exponentialReduceFloatingPoint(startPrice, days) {
  //     return startPrice * 0.5 ** days
  //   }
  //   let ts = (await web3.eth.getBlock('latest')).timestamp - 90 * DAY
  //   let differencePercentSum = 0
  //   let percentMax = 0

  //   const offset = parseInt(process.env.OFFSET)
  //   console.log(offset)
  //   console.time()
  //   for (let i = 0; i <= DAY *  (LAST_DAY + 1); i += 60) {
  //     const contractResult =
  //       Number(await priceOracle.premium('foobar', ts - (i + offset), 0)) /
  //       1e18

  //     const jsResult =
  //       exponentialReduceFloatingPoint(100000000, (i + offset) / 86400) / 2
  //     const percent = Math.abs(contractResult - jsResult) / jsResult
  //     if (percent > percentMax) {
  //       console.log({ percent, i, contractResult, jsResult })
  //       percentMax = percent
  //     }
  //     differencePercentSum += percent
  //   }
  //   console.timeEnd()
  //   fs.writeFileSync(
  //     `stats-${offset}.csv`,
  //     `${percentMax},${differencePercentSum / ((86400 * 28) / 60)}\n`
  //   )
  //   console.log('percent max', percentMax)
  //   console.log('percent avg', differencePercentSum / ((86400 * 28) / 60))
  // })
})
