import hre from 'hardhat'
import { describe, it } from 'vitest'
import { dnsEncodeName } from '../fixtures/dnsEncodeName.js'
import { COIN_TYPE_ETH } from '../fixtures/ensip19.js'
import { FEATURES } from '../utils/features.js'
import {
  bundleCalls,
  type KnownProfile,
  makeResolutions,
} from '../utils/resolutions.js'

const connection = await hre.network.connect()

async function fixture() {
  const resolverCaller = await connection.viem.deployContract(
    'MockResolverCaller',
    [],
    {
      client: {
        public: await connection.viem.getPublicClient({ ccipRead: undefined }),
      },
    },
  )
  const ssResolver = await connection.viem.deployContract(
    'DummyShapeshiftResolver',
  )
  return {
    resolverCaller,
    ssResolver,
  }
}

describe('ResolverCaller', () => {
  for (const multi of [false, true]) {
    for (const offchain of [false, true]) {
      for (const type of ['extended', 'extendedDNS', 'immediate', 'old'] as const) {
        for (const feature of [false, true]) {
          if (type === 'old' && (offchain || feature)) continue;
          let title = `${offchain ? 'offchain' : 'onchain'} ${type}`
          if (multi) title += ' w/multicall'
          if (feature) title += ' w/feature'
          it(title, async () => {
            const F = await connection.networkHelpers.loadFixture(fixture)
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
            await F.ssResolver.write.setOld([type === 'old'])
            await F.ssResolver.write.setExtended([type === 'extended'])
            await F.ssResolver.write.setExtendedDNS([type === 'extendedDNS'])
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
              type === 'extendedDNS',
              '0x1234', // context
              ['x-batch-gateway:true'],
            ])
            bundle.expect(answer)
          })
        }
      }
    }
  }
})
