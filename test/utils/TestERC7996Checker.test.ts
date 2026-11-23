import hre from 'hardhat'
import { zeroAddress } from 'viem'
import { FEATURES } from './features.js'

const connection = await hre.network.connect()

async function fixture() {
  const checker = await connection.viem.deployContract('TestERC7996Checker')
  const ssResolver = await connection.viem.deployContract(
    'DummyShapeshiftResolver',
  )
  return { checker, ssResolver }
}
const loadFixture = async () => connection.networkHelpers.loadFixture(fixture)

const { RESOLVE_MULTICALL } = FEATURES.RESOLVER
const OTHER_FEATURE = '0x12345678'

describe('ERC7996Checker', () => {
  describe('supportsFeatureUnchecked()', () => {
    it('supported', async () => {
      const F = await loadFixture()
      await F.ssResolver.write.setFeature([RESOLVE_MULTICALL, true])
      await expect(
        F.checker.read.supportsFeatureUnchecked([
          F.ssResolver.address,
          RESOLVE_MULTICALL,
        ]),
      ).resolves.toStrictEqual(true)
    })

    it('unsupported', async () => {
      const F = await loadFixture()
      await F.ssResolver.write.setFeature([OTHER_FEATURE, true])
      await expect(
        F.checker.read.supportsFeatureUnchecked([
          F.ssResolver.address,
          RESOLVE_MULTICALL,
        ]),
      ).resolves.toStrictEqual(false)
    })

    it('supported via library constant', async () => {
      const F = await loadFixture()
      await F.ssResolver.write.setFeature([RESOLVE_MULTICALL, true])
      await expect(
        F.checker.read.supportsResolveMulticall([F.ssResolver.address]),
      ).resolves.toStrictEqual(true)
    })

    it('unsupported via library constant', async () => {
      const F = await loadFixture()
      await F.ssResolver.write.setFeature([OTHER_FEATURE, true])
      await expect(
        F.checker.read.supportsResolveMulticall([F.ssResolver.address]),
      ).resolves.toStrictEqual(false)
    })

    it('supported after ERC-165 check', async () => {
      const F = await loadFixture()
      await F.ssResolver.write.setFeature([RESOLVE_MULTICALL, true])
      await expect(
        F.checker.read.supportsFeatureAfterERC165([
          F.ssResolver.address,
          RESOLVE_MULTICALL,
        ]),
      ).resolves.toStrictEqual(true)
    })

    it('unsupported after ERC-165 check', async () => {
      const F = await loadFixture()
      await F.ssResolver.write.setFeature([OTHER_FEATURE, true])
      await expect(
        F.checker.read.supportsFeatureAfterERC165([
          F.ssResolver.address,
          RESOLVE_MULTICALL,
        ]),
      ).resolves.toStrictEqual(false)
    })

    it('not a contract', async () => {
      const F = await loadFixture()
      await expect(
        F.checker.read.supportsFeatureUnchecked([
          zeroAddress,
          RESOLVE_MULTICALL,
        ]),
      ).resolves.toStrictEqual(false)
    })

    it('not implemented', async () => {
      const F = await loadFixture()
      await expect(
        F.checker.read.supportsFeatureUnchecked([
          F.checker.address,
          RESOLVE_MULTICALL,
        ]),
      ).resolves.toStrictEqual(false)
    })
  })
})
