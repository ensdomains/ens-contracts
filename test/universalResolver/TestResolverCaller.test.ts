import hre from 'hardhat'
import {
  encodeErrorResult,
  encodeFunctionData,
  encodeFunctionResult,
  toFunctionSelector,
  zeroHash,
} from 'viem'
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
    createMaliciousOffchainLookup,
  }
  function createMaliciousOffchainLookup() {
    return encodeErrorResult({
      abi: ssResolver.abi,
      errorName: 'OffchainLookup',
      args: [
        resolverCaller.address, // top level
        // resolveDirectImmediateCallback(response, extraData) will return response
        [`data:application/json,{"data":"0xBAAD"}`], // response
        '0x', // callData (ignored) by data url
        toFunctionSelector('resolveDirectImmediateCallback(bytes,bytes)'),
        '0x', // extraData (ignored)
      ],
    })
  }
}

describe('ResolverCaller', () => {
  for (const multi of [false, true]) {
    for (const offchain of [false, true]) {
      for (const type of [
        'extended',
        'extendedDNS',
        'immediate',
        'old',
      ] as const) {
        for (const feature of [false, true]) {
          if (type === 'old' && (offchain || feature)) continue
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

  describe('Untrusted External Call Guards', () => {
    // all other external calls are trusted:
    // - ENSRegistry.resolver()
    // - DNSSEC.verifyRRSet()
    // - ChainReverseResolver.fetch()

    it('supportsInterface()', async () => {
      const F = await connection.networkHelpers.loadFixture(fixture)
      const resolver = await connection.viem.deployContract(
        'MockERC165RevertingResolver',
        [F.createMaliciousOffchainLookup()],
      )
      await expect(
        F.resolverCaller.read.callResolver([
          resolver.address,
          '0x00',
          encodeFunctionData({
            abi: resolver.abi,
            functionName: 'addr',
            args: [zeroHash],
          }),
          false,
          '0x',
          ['x-batch-gateway:true'],
        ]),
      ).resolves.toStrictEqual(
        encodeFunctionResult({
          abi: resolver.abi,
          functionName: 'addr',
          result: resolver.address,
        }),
      )
    })

    it('supportsFeature()', async () => {
      const F = await connection.networkHelpers.loadFixture(fixture)
      const resolver = await connection.viem.deployContract(
        'MockERC7996RevertingResolver',
        [F.createMaliciousOffchainLookup()],
      )
      await expect(
        F.resolverCaller.read.callResolver([
          resolver.address,
          '0x00',
          encodeFunctionData({
            abi: resolver.abi,
            functionName: 'addr',
            args: [zeroHash],
          }),
          false,
          '0x',
          ['x-batch-gateway:true'],
        ]),
      ).resolves.toStrictEqual(
        encodeFunctionResult({
          abi: resolver.abi,
          functionName: 'addr',
          result: resolver.address,
        }),
      )
    })
  })

  describe('InvalidOffchainLookup', () => {
    for (const offchain of [false, true]) {
      for (const direct of [true, false]) {
        it(`${direct ? 'CCIPReader' : 'CCIPBatcher'} during ${
          offchain ? 'callback' : 'call'
        }`, async () => {
          const F = await connection.networkHelpers.loadFixture(fixture)
          await F.ssResolver.write.setOffchain([offchain])
          await F.ssResolver.write.setFeature(['0x00000000', direct]) // any feature will enable ERC-7996
          const callData = '0x12345678' // arbitrary
          await F.ssResolver.write.setResponse([
            callData,
            F.createMaliciousOffchainLookup(),
          ])
          await expect(
            F.resolverCaller.read.callResolver([
              F.ssResolver.address,
              '0x00',
              callData,
              false,
              '0x',
              ['x-batch-gateway:true'],
            ]),
          ).toBeRevertedWithCustomError('InvalidOffchainLookup')
        })
      }
    }
  })
})
