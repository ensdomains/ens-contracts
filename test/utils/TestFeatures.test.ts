import hre from 'hardhat'
import { readFileSync } from 'node:fs'
import { FEATURES, makeFeature } from './features.js'

const connection = await hre.network.connect()

async function fixture() {
  return connection.viem.deployContract('DummyShapeshiftResolver')
}

describe('ResolverFeatures', () => {
  const code = readFileSync(
    new URL('../../contracts/resolvers/ResolverFeatures.sol', import.meta.url),
    'utf8',
  )
  for (const [_, reverseName, featureName] of code.matchAll(
    /constant (\S+) =\s+bytes4\(keccak256\("([^"]+)"\)\);/gm,
  )) {
    const feature = makeFeature(featureName)
    it(`${reverseName} = "${featureName}" = ${feature}`, async () => {
      expect(reverseName in FEATURES.RESOLVER, 'missing').toStrictEqual(true)
      expect(feature, 'hash').toStrictEqual(
        FEATURES.RESOLVER[reverseName as keyof typeof FEATURES.RESOLVER],
      )
      const F = await connection.networkHelpers.loadFixture(fixture)
      await F.write.setFeature([feature, true])
      await expect(
        F.read.supportsFeature([feature]),
        'supports',
      ).resolves.toStrictEqual(true)
    })
  }
})
