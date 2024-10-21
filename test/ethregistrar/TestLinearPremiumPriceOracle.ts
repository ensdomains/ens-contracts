import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import hre from 'hardhat'
import { labelhash, namehash, zeroHash } from 'viem'

const DAY = 86400n

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
    'LinearPremiumPriceOracle',
    [
      dummyOracle.address,
      [0n, 0n, 4n, 2n, 1n],
      100000000000000000000n,
      1000000000000000n,
    ],
  )

  return { ensRegistry, baseRegistrar, priceOracle, publicClient, accounts }
}

describe('LinearPremiumPriceOracle', () => {
  it('should report the correct premium and decrease rate', async () => {
    const { priceOracle } = await loadFixture(fixture)
    await expect(priceOracle.read.initialPremium()).resolves.toEqual(
      100000000000000000000n,
    )
    await expect(priceOracle.read.premiumDecreaseRate()).resolves.toEqual(
      1000000000000000n,
    )
  })

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
      .then((b) => b.timestamp - 90n * DAY)
    await expect(
      priceOracle.read.premium(['foobar', timestamp, 0n]),
    ).resolves.toEqual(50000000000000000000n)
    await expect(
      priceOracle.read.price(['foobar', timestamp, 0n]),
    ).resolves.toHaveProperty('premium', 50000000000000000000n)
  })

  it('should specify half the premium after half the interval', async () => {
    const { priceOracle, publicClient } = await loadFixture(fixture)
    const timestamp = await publicClient
      .getBlock()
      .then((b) => b.timestamp - (90n * DAY + 50000n))
    await expect(
      priceOracle.read.premium(['foobar', timestamp, 0n]),
    ).resolves.toEqual(25000000000000000000n)
    await expect(
      priceOracle.read.price(['foobar', timestamp, 0n]),
    ).resolves.toHaveProperty('premium', 25000000000000000000n)
  })

  it('should return correct times for price queries', async () => {
    const { priceOracle } = await loadFixture(fixture)
    const initialPremiumWei = 50000000000000000000n
    await expect(
      priceOracle.read.timeUntilPremium([0n, initialPremiumWei]),
    ).resolves.toEqual(90n * DAY)
    await expect(priceOracle.read.timeUntilPremium([0n, 0n])).resolves.toEqual(
      90n * DAY + 100000n,
    )
  })
})
