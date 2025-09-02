import hre from 'hardhat'
import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'

import { serveBatchGateway } from '../fixtures/localBatchGateway.js'
import { dnsEncodeName } from '../fixtures/dnsEncodeName.js'
import { COIN_TYPE_ETH } from '../fixtures/ensip19.js'
import { FEATURES } from '../utils/features.js'
import {
  bundleCalls,
  type KnownProfile,
  makeResolutions,
} from '../utils/resolutions.js'

async function fixture() {
  const bg = await serveBatchGateway()
  after(bg.shutdown)
  const resolverCaller = await hre.viem.deployContract(
    'MockResolverCaller',
    [],
    {
      client: {
        public: await hre.viem.getPublicClient({ ccipRead: undefined }),
      },
    },
  )
  const ssResolver = await hre.viem.deployContract('DummyShapeshiftResolver')
  return {
    bg,
    resolverCaller,
    ssResolver,
  }
}

describe('TestResolverCaller', () => {
  for (const multi of [false, true]) {
    for (const offchain of [false, true]) {
      for (const extended of [false, true]) {
        for (const feature of [false, true]) {
          let title = `${offchain ? 'offchain' : 'onchain'} ${
            extended ? 'extended' : 'immediate'
          }`
          if (multi) title += ' w/multicall'
          if (feature) title += ' w/feature'
          it(title, async () => {
            const F = await loadFixture(fixture)
            const kp: KnownProfile = {
              name: 'test.eth',
              addresses: [
                {
                  coinType: COIN_TYPE_ETH,
                  value: '0x8000000000000000000000000000000000000001',
                },
              ],
              texts: [{ key: 'url', value: 'https://ens.domains' }],
            }
            await F.ssResolver.write.setExtended([extended])
            await F.ssResolver.write.setOffchain([offchain])
            await F.ssResolver.write.setDeriveMulticall([multi])
            await F.ssResolver.write.setFeature([
              FEATURES.RESOLVER.RESOLVE_MULTICALL,
              feature,
            ])
            const bundle = bundleCalls(
              makeResolutions(kp).slice(0, multi ? Infinity : 1),
            )
            for (const res of bundle.resolutions) {
              await F.ssResolver.write.setResponse([res.call, res.answer])
            }
            const answer = await F.resolverCaller.read.callResolver([
              F.ssResolver.address,
              dnsEncodeName(kp.name),
              bundle.call,
              [F.bg.localBatchGatewayUrl],
            ])
            bundle.expect(answer)
          })
        }
      }
    }
  }
})
