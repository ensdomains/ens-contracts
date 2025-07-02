import hre from 'hardhat'
import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import { readFileSync } from 'node:fs'
import { FEATURES, makeFeature } from './features.js'

async function fixture() {
  return hre.viem.deployContract('DummyShapeshiftResolver')
}

describe('ResolverFeatures', () => {
  const code = readFileSync(
    new URL('../../contracts/resolvers/ResolverFeatures.sol', import.meta.url),
    'utf8',
  )
  for (const [_, name, featureName] of code.matchAll(
    /constant (\S+) =\s+bytes4\(keccak256\("([^"]+)"\)\);/gm,
  )) {
    const feature = makeFeature(featureName)
    it(`${name} = "${featureName}" = ${feature}`, async () => {
      expect(name in FEATURES.RESOLVER, 'missing').toStrictEqual(true)
      expect(feature, 'hash').toStrictEqual(
        FEATURES.RESOLVER[name as keyof typeof FEATURES.RESOLVER],
      )
      const F = await loadFixture(fixture)
      await F.write.setFeature([feature, true])
      await expect(
        F.read.supportsFeature([feature]),
        'supports',
      ).resolves.toStrictEqual(true)
    })
  }
})
