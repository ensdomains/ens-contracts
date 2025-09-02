import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import hre from 'hardhat'
import { type Address, decodeEventLog, getAddress, getContract } from 'viem'
import { dnsEncodeName } from '../fixtures/dnsEncodeName.js'
import { COIN_TYPE_ETH } from '../fixtures/ensip19.js'
import { serveBatchGateway } from '../fixtures/localBatchGateway.js'
import { writeContract } from 'viem/actions'
import {
  bundleCalls,
  KnownProfile,
  makeResolutions,
} from '../utils/resolutions.js'
import { FEATURES } from '../utils/features.js'

async function fixture() {
  const client = await hre.viem.getPublicClient({ ccipRead: undefined })
  const [owner] = await hre.viem.getWalletClients()
  const bg = await serveBatchGateway()
  after(bg.shutdown)
  const batchGatewayProvider = await hre.viem.deployContract(
    'GatewayProvider',
    [owner.account.address, [bg.localBatchGatewayUrl]],
  )
  const fallbackResolverImpl = await hre.viem.deployContract(
    'FallbackResolver',
    [batchGatewayProvider.address],
  )
  const ss1 = await hre.viem.deployContract('DummyShapeshiftResolver')
  const ss2 = await hre.viem.deployContract('DummyShapeshiftResolver')
  return {
    owner,
    client,
    bg,
    ss1,
    ss2,
    fallbackResolverImpl,
    deployFallbackResolver,
  }

  async function deployFallbackResolver(
    resolvers: readonly Address[],
    address = fallbackResolverImpl.address,
  ) {
    const { abi } = fallbackResolverImpl
    const hash = await writeContract(client, {
      account: owner.account,
      address,
      abi,
      functionName: 'deploy',
      args: [resolvers],
    })
    const receipt = await client.waitForTransactionReceipt({ hash })
    const log = decodeEventLog({
      abi,
      data: receipt.logs[0].data,
      topics: receipt.logs[0].topics,
    })
    return getContract({
      address: log.args[0],
      abi,
      client,
    })
  }
}

describe('FallbackResolver', () => {
  it('resolves()', async () => {
    const F = await loadFixture(fixture)
    const v = [F.ss1.address, F.ss2.address]
    const r = await F.deployFallbackResolver(v)
    await expect(r.read.resolvers()).resolves.toStrictEqual(
      v.map((x) => getAddress(x)),
    )
  })

  it('deploy() through clone', async () => {
    const F = await loadFixture(fixture)
    const r1 = await F.deployFallbackResolver([F.ss1.address])
    const a = F.ss2.address
    const r2 = await F.deployFallbackResolver([a], r1.address)
    await expect(r2.read.resolvers()).resolves.toStrictEqual([getAddress(a)])
  })

  describe('resolve()', () => {
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
    const resolutions = makeResolutions(kp)
    for (let n = 1; n <= resolutions.length; n++) {
      describe(`calls = ${n}`, () => {
        const bundle = bundleCalls(resolutions.slice(0, n))
        // assume: 2 resolvers
        for (let bits = 0, max = 1 << (3 * 2); bits < max; bits++) {
          const extended = [0, 1].map((x) => !!(bits & (1 << x)))
          const offchain = [2, 3].map((x) => !!(bits & (1 << x)))
          const multi = [4, 5].map((x) => !!(bits & (1 << x)))
          const parts: number[][] = [[], []]
          for (let i = 0; i < n; i++) {
            parts[(Math.random() * parts.length) | 0].push(i)
          }
          let title = ''
          for (let i = 0; i < multi.length; i++) {
            if (title) title += ' + '
            title += `#${i + 1}<`
            if (extended[i]) title += 'E'
            if (offchain[i]) title += 'O'
            if (multi[i]) title += 'M'
            title += `>[${parts[i].map((j) => bundle.resolutions[j].desc)}]`
          }
          it(title, async () => {
            const F = await loadFixture(fixture)
            const sss = [F.ss1, F.ss2]
            for (let i = 0; i < sss.length; i++) {
              const ss = sss[i]
              await ss.write.setExtended([extended[i]])
              await ss.write.setOffchain([offchain[i]])
              await ss.write.setDeriveMulticall([multi[i]])
              await ss.write.setFeature([
                FEATURES.RESOLVER.RESOLVE_MULTICALL,
                multi[i],
              ])
              for (let j of parts[i]) {
                const res = bundle.resolutions[j]
                await ss.write.setResponse([res.call, res.answer])
              }
            }
            const r = await F.deployFallbackResolver(sss.map((x) => x.address))
            const answer = await r.read.resolve([
              dnsEncodeName(kp.name),
              bundle.call,
            ])
            bundle.expect(answer)
          })
        }
      })
    }
  })
})
