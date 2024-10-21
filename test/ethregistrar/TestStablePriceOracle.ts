import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import hre from 'hardhat'

async function fixture() {
  // Dummy oracle with 1 ETH == 10 USD
  const dummyOracle = await hre.viem.deployContract('DummyOracle', [
    1000000000n,
  ])

  return { dummyOracle }
}

describe('StablePriceOracle', () => {
  it('should return correct prices', async () => {
    const { dummyOracle } = await loadFixture(fixture)

    // 4 attousd per second for 3 character names, 2 attousd per second for 4 character names,
    // 1 attousd per second for longer names.
    const priceOracle = await hre.viem.deployContract('StablePriceOracle', [
      dummyOracle.address,
      [0n, 0n, 4n, 2n, 1n],
    ])

    await expect(
      priceOracle.read.price(['foo', 0n, 3600n]),
    ).resolves.toHaveProperty('base', 1440n)
    await expect(
      priceOracle.read.price(['quux', 0n, 3600n]),
    ).resolves.toHaveProperty('base', 720n)
    await expect(
      priceOracle.read.price(['fubar', 0n, 3600n]),
    ).resolves.toHaveProperty('base', 360n)
    await expect(
      priceOracle.read.price(['foobie', 0n, 3600n]),
    ).resolves.toHaveProperty('base', 360n)
  })

  it('should work with larger volumes', async () => {
    const { dummyOracle } = await loadFixture(fixture)

    // 4 attousd per second for 3 character names, 2 attousd per second for 4 character names,
    // 1 attousd per second for longer names.
    const priceOracle = await hre.viem.deployContract('StablePriceOracle', [
      dummyOracle.address,
      [
        0n,
        0n,
        // 1 USD per second!
        1000000000000000000n,
        2n,
        1n,
      ],
    ])

    await expect(
      priceOracle.read.price(['foo', 0n, 86400n]),
    ).resolves.toHaveProperty('base', 8640000000000000000000n)
  })
})
