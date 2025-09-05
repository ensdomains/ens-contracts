import hre from 'hardhat'

import { dnsEncodeName } from '../fixtures/dnsEncodeName.js'
import { shortCoin } from '../fixtures/ensip19.js'
import { isHardhatFork } from '../fixtures/forked.js'
import { serveBatchGateway } from '../fixtures/localBatchGateway.js'
import { ENS_REGISTRY, KNOWN_PRIMARIES, KNOWN_RESOLUTIONS } from './mainnet.js'
import { bundleCalls, makeResolutions } from '../utils/resolutions.js'

// $ bun run test:remote

const connection = await hre.network.connect()

async function fixture() {
  const bg = await serveBatchGateway()
  afterAll(bg.shutdown)

  const [owner] = await connection.viem.getWalletClients()
  const batchGatewayProvider = await connection.viem.deployContract(
    'GatewayProvider',
    [owner.account.address, [bg.localBatchGatewayUrl]],
  )

  return connection.viem.deployContract(
    'UniversalResolver',
    [owner.account.address, ENS_REGISTRY, batchGatewayProvider.address],
    {
      client: {
        public: await connection.viem.getPublicClient({ ccipRead: undefined }),
      },
    },
  )
}
const loadFixture = async () => connection.networkHelpers.loadFixture(fixture)

;(isHardhatFork() ? describe : describe.skip)(
  'UniversalResolver @ mainnet',
  () => {
    describe('resolve()', () => {
      for (const x of KNOWN_RESOLUTIONS) {
        const calls = makeResolutions(x)
        it(`${x.title}: ${x.name} [${calls.length}]`, async () => {
          const bundle = bundleCalls(calls)
          const F = await loadFixture()
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
          const F = await loadFixture()
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
