import hre from 'hardhat'
import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import { dnsEncodeName } from '../fixtures/dnsEncodeName.js'
import { serveBatchGateway } from '../fixtures/localBatchGateway.js'
import { shortCoin } from '../fixtures/ensip19.js'
import { isHardhatFork } from '../fixtures/forked.js'
import { ENS_REGISTRY, KNOWN_PRIMARIES, KNOWN_RESOLUTIONS } from './mainnet.js'
import { bundleCalls, makeResolutions } from '../utils/resolutions.js'

// $ bun run test:remote

async function fixture() {
  const bg = await serveBatchGateway()
  after(bg.shutdown)
  const [owner] = await hre.viem.getWalletClients()
  const batchGatewayProvider = await hre.viem.deployContract(
    'GatewayProvider',
    [owner.account.address, [bg.localBatchGatewayUrl]],
  )
  return hre.viem.deployContract(
    'UniversalResolver',
    [owner.account.address, ENS_REGISTRY, batchGatewayProvider.address],
    {
      client: {
        public: await hre.viem.getPublicClient({ ccipRead: undefined }),
      },
    },
  )
}

;(isHardhatFork() ? describe : describe.skip)(
  'UniversalResolver @ mainnet',
  () => {
    describe('resolve()', () => {
      for (const x of KNOWN_RESOLUTIONS) {
        const calls = makeResolutions(x)
        it(`${x.title}: ${x.name} [${calls.length}]`, async () => {
          const bundle = bundleCalls(calls)
          const F = await loadFixture(fixture)
          const [answer] = await F.read.resolve([
            dnsEncodeName(x.name),
            bundle.call,
          ])
          bundle.expect(answer)
        })
      }
    })
    describe('reverse()', () => {
      for (const x of KNOWN_PRIMARIES) {
        it(`${x.title}: ${shortCoin(x.coinType)} ${x.address}`, async () => {
          const F = await loadFixture(fixture)
          const promise = F.read.reverse([x.address, x.coinType])
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
