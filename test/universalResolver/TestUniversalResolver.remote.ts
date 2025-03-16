import hre from 'hardhat'
import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import { dnsEncodeName } from '../fixtures/dnsEncodeName.js'
import { serveBatchGateway } from '../fixtures/localBatchGateway.js'
import { shortCoin } from '../fixtures/ensip19.js'
import { isHardhatFork } from '../fixtures/forked.js'
import { ENS_REGISTRY, KNOWN_PRIMARIES, KNOWN_RESOLUTIONS } from './mainnet.js'
import { bundleCalls, makeResolutions } from './utils.js'

async function fixture() {
  const bg = await serveBatchGateway()
  after(bg.shutdown)
  const ForwardResolution = await hre.viem.deployContract(
    'ForwardResolutionV1',
    [ENS_REGISTRY, [bg.localBatchGatewayUrl]],
  )
  const UniversalResolver = await hre.viem.deployContract(
    'UniversalResolver',
    [ForwardResolution.address],
    {
      client: {
        public: await hre.viem.getPublicClient({ ccipRead: undefined }),
      },
    },
  )
  return { UniversalResolver }
}

;(isHardhatFork() ? describe : describe.skip)(
  'UniversalResolver @ mainnet',
  () => {
    describe('resolve()', () => {
      for (const x of KNOWN_RESOLUTIONS) {
        it(`${x.title}: ${x.name}`, async () => {
          const calls = makeResolutions(x)
          const bundle = bundleCalls(calls)
          const { UniversalResolver } = await loadFixture(fixture)
          const [answer] = await UniversalResolver.read.resolve([
            dnsEncodeName(x.name),
            bundle.call,
          ])
          bundle.expect(answer)
        })
      }
    })
    describe('reverse()', () => {
      for (const x of KNOWN_PRIMARIES) {
        it(`${shortCoin(x.coinType)} ${x.encodedAddress}`, async () => {
          const { UniversalResolver } = await loadFixture(fixture)
          const promise = UniversalResolver.read.reverse([
            x.encodedAddress,
            x.coinType,
          ])
          if (x.expectError) {
            await expect(promise).rejects.toThrow()
          } else {
            const [name] = await promise
            if (x.expectPrimary) expect(name).not.toHaveLength(0)
          }
        })
      }
    })
  },
)
