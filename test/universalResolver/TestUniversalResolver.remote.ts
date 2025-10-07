import hre from 'hardhat'

import { dnsEncodeName } from '../fixtures/dnsEncodeName.js'
import { getReverseNamespace } from '../fixtures/ensip19.js'
import { ENS_REGISTRY, KNOWN_PRIMARIES, KNOWN_RESOLUTIONS } from './mainnet.js'
import { bundleCalls, makeResolutions } from '../utils/resolutions.js'

// $ bun run test:remote

const connection = await hre.network.connect('mainnetFork')

async function fixture() {
  const [owner] = await connection.viem.getWalletClients()
  const batchGatewayProvider = await connection.viem.deployContract(
    'GatewayProvider',
    [owner.account.address, ['x-batch-gateway:true']],
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

describe('UniversalResolver @ mainnet', () => {
  describe('resolve()', () => {
    for (const x of KNOWN_RESOLUTIONS) {
      const calls = makeResolutions(x)
      it(`${x.title}: ${x.name} [${calls.length}]`, async () => {
        const bundle = bundleCalls(calls)
        const F = await connection.networkHelpers.loadFixture(fixture)
        const [answer] = await F.read.resolve([
          dnsEncodeName(x.name),
          bundle.call,
        ])
        bundle.expect(answer)
      })
    }
  })
  for (const coinType of new Set(KNOWN_PRIMARIES.map((x) => x.coinType))) {
    describe(`reverse(${getReverseNamespace(coinType)})`, () => {
      for (const x of KNOWN_PRIMARIES.filter((x) => x.coinType === coinType)) {
        it(
          `${x.address} ${x.title || x.primary || '<empty>'}`,
          { timeout: 10000 },
          async () => {
            const F = await connection.networkHelpers.loadFixture(fixture)
            const promise = F.read.reverse([x.address, x.coinType])
            if (typeof x.primary === 'string') {
              const [primary] = await promise
              expect(primary).toStrictEqual(x.primary)
            } else {
              await expect(promise).rejects.toThrow()
            }
          },
        )
      }
    })
  }
})
