import { shouldSupportInterfaces } from '@ensdomains/hardhat-chai-matchers-viem/behaviour'
import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import hre from 'hardhat'
import {
  encodeErrorResult,
  HttpRequestError,
  keccak256,
  namehash,
  toBytes,
  toFunctionSelector,
  toHex,
  zeroAddress,
} from 'viem'
import { deployDefaultReverseFixture } from '../fixtures/deployDefaultReverseFixture.js'
import { dnsEncodeName } from '../fixtures/dnsEncodeName.js'
import {
  COIN_TYPE_DEFAULT,
  COIN_TYPE_ETH,
  getReverseName,
  shortCoin,
} from '../fixtures/ensip19.js'
import { expectVar } from '../fixtures/expectVar.js'
import { serveBatchGateway } from '../fixtures/localBatchGateway.js'
import {
  bundleCalls,
  getParentName,
  makeResolutions,
} from '../utils/resolutions.js'
import { FEATURES } from '../utils/features.js'

async function fixture() {
  const F = await deployDefaultReverseFixture()
  const reverseRegistrar = await hre.viem.deployContract('ReverseRegistrar', [
    F.ensRegistry.address,
  ])
  await F.takeControl('addr.reverse')
  await F.ensRegistry.write.setRecord([
    namehash('addr.reverse'),
    reverseRegistrar.address,
    zeroAddress,
    0n,
  ])
  const publicResolver = await hre.viem.deployContract('PublicResolver', [
    F.ensRegistry.address,
    zeroAddress, // nameWrapper
    zeroAddress, // ethController
    reverseRegistrar.address,
  ])
  await reverseRegistrar.write.setDefaultResolver([publicResolver.address])
  const oldResolver = await hre.viem.deployContract('DummyOldResolver')
  const shapeshift1 = await hre.viem.deployContract('DummyShapeshiftResolver')
  const shapeshift2 = await hre.viem.deployContract('DummyShapeshiftResolver')
  const bg = await serveBatchGateway()
  after(bg.shutdown)
  const batchGatewayProvider = await hre.viem.deployContract(
    'GatewayProvider',
    [F.owner, [bg.localBatchGatewayUrl]],
  )
  const universalResolver = await hre.viem.deployContract(
    'UniversalResolver',
    [F.owner, F.ensRegistry.address, batchGatewayProvider.address],
    {
      client: {
        public: await hre.viem.getPublicClient({ ccipRead: undefined }),
      },
    },
  )
  return {
    ...F,
    universalResolver,
    batchGatewayProvider,
    publicResolver,
    reverseRegistrar,
    oldResolver,
    shapeshift1,
    shapeshift2,
  }
}

const dummyBytes4 = '0x12345678'
const testName = 'test.eth' // DummyResolver name
const anotherAddress = '0x8000000000000000000000000000000000000001'
const resolutions = makeResolutions({
  name: testName,
  addresses: [{ coinType: COIN_TYPE_ETH, value: anotherAddress }],
  texts: [{ key: 'description', value: 'Test' }],
})

describe('UniversalResolver', () => {
  shouldSupportInterfaces({
    contract: () => loadFixture(fixture).then((F) => F.universalResolver),
    interfaces: [
      '@openzeppelin/contracts/utils/introspection/IERC165.sol:IERC165',
      'IUniversalResolver',
    ],
  })

  describe('findResolver()', () => {
    it('unset', async () => {
      const F = await loadFixture(fixture)
      await F.takeControl(testName)
      const [resolver, node, offset] =
        await F.universalResolver.read.findResolver([dnsEncodeName(testName)])
      expectVar({ resolver }).toEqualAddress(zeroAddress)
      expectVar({ node }).toStrictEqual(namehash(testName))
      expectVar({ offset }).toStrictEqual(0n)
    })

    it('immediate', async () => {
      const F = await loadFixture(fixture)
      await F.takeControl(testName)
      await F.ensRegistry.write.setResolver([
        namehash(testName),
        F.shapeshift1.address,
      ])
      const [resolver, node, offset] =
        await F.universalResolver.read.findResolver([dnsEncodeName(testName)])
      expectVar({ resolver }).toEqualAddress(F.shapeshift1.address)
      expectVar({ node }).toStrictEqual(namehash(testName))
      expectVar({ offset }).toStrictEqual(0n)
    })

    it('extended', async () => {
      const F = await loadFixture(fixture)
      await F.takeControl(testName)
      await F.ensRegistry.write.setResolver([
        namehash(getParentName(testName)),
        F.shapeshift1.address,
      ])
      await F.shapeshift1.write.setExtended([true])
      const [resolver, node, offset] =
        await F.universalResolver.read.findResolver([dnsEncodeName(testName)])
      expectVar({ resolver }).toEqualAddress(F.shapeshift1.address)
      expectVar({ node }).toStrictEqual(namehash(testName))
      expectVar({ offset }).toStrictEqual(
        BigInt(1 + toBytes(testName.split('.')[0]).length),
      )
    })

    it('auto-encrypted', async () => {
      const F = await loadFixture(fixture)
      const name = `${'1'.repeat(300)}.${testName}`
      await F.takeControl(name)
      await F.ensRegistry.write.setResolver([
        namehash(name),
        F.shapeshift1.address,
      ])
      const [resolver, node, offset] =
        await F.universalResolver.read.findResolver([dnsEncodeName(name)])
      expectVar({ resolver }).toEqualAddress(F.shapeshift1.address)
      expectVar({ node }).toStrictEqual(namehash(name))
      expectVar({ offset }).toStrictEqual(0n)
    })

    it('self-encrypted', async () => {
      const F = await loadFixture(fixture)
      const name = testName
        .split('.')
        .map((x) => `[${keccak256(toHex(x)).slice(2)}]`)
        .join('.')
      await F.takeControl(name)
      await F.ensRegistry.write.setResolver([
        namehash(name),
        F.shapeshift1.address,
      ])
      const [resolver, node, offset] =
        await F.universalResolver.read.findResolver([dnsEncodeName(name)])
      expectVar({ resolver }).toEqualAddress(F.shapeshift1.address)
      expectVar({ node }).toStrictEqual(namehash(name))
      expectVar({ offset }).toStrictEqual(0n)
    })
  })

  describe('resolve()', () => {
    it('unset', async () => {
      const F = await loadFixture(fixture)
      await expect(F.universalResolver)
        .read('resolve', [dnsEncodeName(testName), dummyBytes4])
        .toBeRevertedWithCustomError('ResolverNotFound')
        .withArgs(dnsEncodeName(testName))
    })

    it('not extended', async () => {
      const F = await loadFixture(fixture)
      await F.takeControl(testName)
      await F.ensRegistry.write.setResolver([
        namehash(getParentName(testName)),
        F.owner,
      ])
      await expect(F.universalResolver)
        .read('resolve', [dnsEncodeName(testName), dummyBytes4])
        .toBeRevertedWithCustomError('ResolverNotFound')
        .withArgs(dnsEncodeName(testName))
    })

    it('not a contract', async () => {
      const F = await loadFixture(fixture)
      await F.takeControl(testName)
      await F.ensRegistry.write.setResolver([namehash(testName), F.owner])
      await expect(F.universalResolver)
        .read('resolve', [dnsEncodeName(testName), dummyBytes4])
        .toBeRevertedWithCustomError('ResolverNotContract')
        .withArgs(dnsEncodeName(testName), F.owner)
    })

    it('empty response', async () => {
      const F = await loadFixture(fixture)
      await F.takeControl(testName)
      await F.ensRegistry.write.setResolver([
        namehash(testName),
        F.shapeshift1.address,
      ])
      await expect(F.universalResolver)
        .read('resolve', [dnsEncodeName(testName), dummyBytes4])
        .toBeRevertedWithCustomError('UnsupportedResolverProfile')
        .withArgs(dummyBytes4)
    })

    it('empty revert', async () => {
      const F = await loadFixture(fixture)
      await F.takeControl(testName)
      await F.ensRegistry.write.setResolver([
        namehash(testName),
        F.shapeshift1.address,
      ])
      await F.shapeshift1.write.setRevertEmpty([true])
      await expect(F.universalResolver)
        .read('resolve', [dnsEncodeName(testName), dummyBytes4])
        .toBeRevertedWithCustomError('ResolverError')
        .withArgs('0x')
    })

    it('resolver revert', async () => {
      const F = await loadFixture(fixture)
      await F.takeControl(testName)
      await F.ensRegistry.write.setResolver([
        namehash(testName),
        F.shapeshift1.address,
      ])
      await F.shapeshift1.write.setResponse([dummyBytes4, dummyBytes4])
      await expect(F.universalResolver)
        .read('resolve', [dnsEncodeName(testName), dummyBytes4])
        .toBeRevertedWithCustomError('ResolverError')
        .withArgs(dummyBytes4)
    })

    it('batch gateway revert', async () => {
      const F = await loadFixture(fixture)
      const bg = await serveBatchGateway(() => {
        throw new HttpRequestError({ status: 400, url: '' })
      })
      after(bg.shutdown)
      await F.takeControl(testName)
      await F.ensRegistry.write.setResolver([
        namehash(testName),
        F.shapeshift1.address,
      ])
      await F.shapeshift1.write.setResponse([dummyBytes4, dummyBytes4])
      await F.shapeshift1.write.setOffchain([true])
      await expect(F.universalResolver)
        .read('resolveWithGateways', [
          dnsEncodeName(testName),
          dummyBytes4,
          [bg.localBatchGatewayUrl],
        ])
        .toBeRevertedWithCustomError('HttpError')
        .withArgs(400, 'HTTP request failed.')
    })

    it('unsupported revert', async () => {
      const F = await loadFixture(fixture)
      await F.takeControl(testName)
      await F.ensRegistry.write.setResolver([
        namehash(testName),
        F.shapeshift1.address,
      ])
      await F.shapeshift1.write.setRevertUnsupportedResolverProfile([true])
      await expect(F.universalResolver)
        .read('resolve', [dnsEncodeName(testName), dummyBytes4])
        .toBeRevertedWithCustomError('UnsupportedResolverProfile')
        .withArgs(dummyBytes4)
    })

    it('old', async () => {
      const F = await loadFixture(fixture)
      await F.takeControl(testName)
      await F.ensRegistry.write.setResolver([
        namehash(testName),
        F.oldResolver.address,
      ])
      const [res] = makeResolutions({
        name: testName,
        primary: { value: testName },
      })
      const [answer, resolver] = await F.universalResolver.read.resolve([
        dnsEncodeName(testName),
        res.call,
      ])
      expectVar({ resolver }).toEqualAddress(F.oldResolver.address)
      res.expect(answer)
    })

    it('old w/multicall (1 revert)', async () => {
      const F = await loadFixture(fixture)
      await F.takeControl(testName)
      await F.ensRegistry.write.setResolver([
        namehash(testName),
        F.oldResolver.address,
      ])
      const bundle = bundleCalls(
        makeResolutions({
          name: testName,
          primary: { value: testName },
          errors: [{ call: dummyBytes4, answer: '0x' }],
        }),
      )
      const [answer, resolver] = await F.universalResolver.read.resolve([
        dnsEncodeName(testName),
        bundle.call,
      ])
      expectVar({ resolver }).toEqualAddress(F.oldResolver.address)
      bundle.expect(answer)
    })

    it('PR addr()', async () => {
      const F = await loadFixture(fixture)
      await F.takeControl(testName)
      await F.ensRegistry.write.setResolver([
        namehash(testName),
        F.publicResolver.address,
      ])
      const [res] = makeResolutions({
        name: testName,
        addresses: [{ coinType: COIN_TYPE_ETH, value: anotherAddress }],
      })
      await F.publicResolver.write.multicall([[res.write]])
      const [answer, resolver] = await F.universalResolver.read.resolve([
        dnsEncodeName(testName),
        res.call,
      ])
      expectVar({ resolver }).toEqualAddress(F.publicResolver.address)
      res.expect(answer)
    })

    it('PR addr() w/fallback', async () => {
      const F = await loadFixture(fixture)
      await F.takeControl(testName)
      await F.ensRegistry.write.setResolver([
        namehash(testName),
        F.publicResolver.address,
      ])
      const [res0, res] = makeResolutions({
        name: testName,
        addresses: [
          { coinType: COIN_TYPE_DEFAULT, value: anotherAddress },
          { coinType: COIN_TYPE_ETH, value: anotherAddress },
        ],
      })
      await F.publicResolver.write.multicall([[res0.write]]) // just default
      const [answer, resolver] = await F.universalResolver.read.resolve([
        dnsEncodeName(testName),
        res.call,
      ])
      expectVar({ resolver }).toEqualAddress(F.publicResolver.address)
      res.expect(answer)
    })

    it('PR w/multicall', async () => {
      const F = await loadFixture(fixture)
      await F.takeControl(testName)
      await F.ensRegistry.write.setResolver([
        namehash(testName),
        F.publicResolver.address,
      ])
      const bundle = bundleCalls(resolutions)
      await F.publicResolver.write.multicall([
        bundle.resolutions.map((x) => x.write),
      ])
      const [answer, resolver] = await F.universalResolver.read.resolve([
        dnsEncodeName(testName),
        bundle.call,
      ])
      expectVar({ resolver }).toEqualAddress(F.publicResolver.address)
      bundle.expect(answer)
    })

    it('onchain extended', async () => {
      const F = await loadFixture(fixture)
      await F.takeControl(testName)
      await F.ensRegistry.write.setResolver([
        namehash(getParentName(testName)),
        F.shapeshift1.address,
      ])
      const [res] = resolutions
      await F.shapeshift1.write.setResponse([res.call, res.answer])
      await F.shapeshift1.write.setExtended([true])
      const [answer, resolver] = await F.universalResolver.read.resolve([
        dnsEncodeName(testName),
        res.call,
      ])
      expectVar({ resolver }).toEqualAddress(F.shapeshift1.address)
      res.expect(answer)
    })

    it('onchain extended w/multicall', async () => {
      const F = await loadFixture(fixture)
      await F.takeControl(testName)
      await F.ensRegistry.write.setResolver([
        namehash(getParentName(testName)),
        F.shapeshift1.address,
      ])
      const bundle = bundleCalls(resolutions)
      for (const res of resolutions) {
        await F.shapeshift1.write.setResponse([res.call, res.answer])
      }
      await F.shapeshift1.write.setExtended([true])
      const [answer, resolver] = await F.universalResolver.read.resolve([
        dnsEncodeName(testName),
        bundle.call,
      ])
      expectVar({ resolver }).toEqualAddress(F.shapeshift1.address)
      bundle.expect(answer)
    })

    it('offchain immediate', async () => {
      const F = await loadFixture(fixture)
      await F.takeControl(testName)
      await F.ensRegistry.write.setResolver([
        namehash(testName),
        F.shapeshift1.address,
      ])
      const [res] = resolutions
      await F.shapeshift1.write.setResponse([res.call, res.answer])
      await F.shapeshift1.write.setOffchain([true])
      const [answer, resolver] = await F.universalResolver.read.resolve([
        dnsEncodeName(testName),
        res.call,
      ])
      expectVar({ resolver }).toEqualAddress(F.shapeshift1.address)
      res.expect(answer)
    })

    it('offchain immediate w/multicall', async () => {
      const F = await loadFixture(fixture)
      await F.takeControl(testName)
      await F.ensRegistry.write.setResolver([
        namehash(testName),
        F.shapeshift1.address,
      ])
      const bundle = bundleCalls(resolutions)
      for (const res of resolutions) {
        await F.shapeshift1.write.setResponse([res.call, res.answer])
      }
      await F.shapeshift1.write.setOffchain([true])
      const [answer, resolver] = await F.universalResolver.read.resolve([
        dnsEncodeName(testName),
        bundle.call,
      ])
      expectVar({ resolver }).toEqualAddress(F.shapeshift1.address)
      bundle.expect(answer)
    })

    it('offchain extended', async () => {
      const F = await loadFixture(fixture)
      await F.takeControl(testName)
      await F.ensRegistry.write.setResolver([
        namehash(getParentName(testName)),
        F.shapeshift1.address,
      ])
      const [res] = resolutions
      await F.shapeshift1.write.setResponse([res.call, res.answer])
      await F.shapeshift1.write.setExtended([true])
      await F.shapeshift1.write.setOffchain([true])
      const [answer, resolver] = await F.universalResolver.read.resolve([
        dnsEncodeName(testName),
        res.call,
      ])
      expectVar({ resolver }).toEqualAddress(F.shapeshift1.address)
      res.expect(answer)
    })

    it('offchain extended w/multicall', async () => {
      const F = await loadFixture(fixture)
      await F.takeControl(testName)
      await F.ensRegistry.write.setResolver([
        namehash(getParentName(testName)),
        F.shapeshift1.address,
      ])
      const bundle = bundleCalls(resolutions)
      for (const res of resolutions) {
        await F.shapeshift1.write.setResponse([res.call, res.answer])
      }
      await F.shapeshift1.write.setExtended([true])
      await F.shapeshift1.write.setOffchain([true])
      const [answer, resolver] = await F.universalResolver.read.resolve([
        dnsEncodeName(testName),
        bundle.call,
      ])
      expectVar({ resolver }).toEqualAddress(F.shapeshift1.address)
      bundle.expect(answer)
    })

    it('offchain extended w/multicall (1 revert)', async () => {
      const F = await loadFixture(fixture)
      await F.takeControl(testName)
      await F.ensRegistry.write.setResolver([
        namehash(getParentName(testName)),
        F.shapeshift1.address,
      ])
      const calls = makeResolutions({
        name: testName,
        primary: { value: testName },
        errors: [
          {
            call: dummyBytes4,
            answer: encodeErrorResult({
              abi: F.universalResolver.abi,
              errorName: 'UnsupportedResolverProfile',
              args: [dummyBytes4],
            }),
          },
        ],
      })
      const bundle = bundleCalls(calls)
      for (const res of calls) {
        await F.shapeshift1.write.setResponse([res.call, res.answer])
      }
      await F.shapeshift1.write.setExtended([true])
      await F.shapeshift1.write.setOffchain([true])
      const [answer, resolver] = await F.universalResolver.read.resolve([
        dnsEncodeName(testName),
        bundle.call,
      ])
      expectVar({ resolver }).toEqualAddress(F.shapeshift1.address)
      bundle.expect(answer)
    })
  })

  describe('resolve() w/feature detection', () => {
    it('disabled feature + no gateway', async () => {
      const F = await loadFixture(fixture)
      await F.takeControl(testName)
      await F.ensRegistry.write.setResolver([
        namehash(getParentName(testName)),
        F.shapeshift1.address,
      ])
      await F.shapeshift1.write.setExtended([true])
      await F.shapeshift1.write.setOffchain([true])
      await F.batchGatewayProvider.write.setGateways([[]])
      await expect(
        F.universalResolver.read.resolve([
          dnsEncodeName(testName),
          dummyBytes4,
        ]),
      ).rejects.toThrow(/Offchain Gateway/)
    })

    it('onchain extended w/multicall', async () => {
      const F = await loadFixture(fixture)
      await F.takeControl(testName)
      await F.ensRegistry.write.setResolver([
        namehash(getParentName(testName)),
        F.shapeshift1.address,
      ])
      await F.shapeshift1.write.setFeature([
        FEATURES.RESOLVER.RESOLVE_MULTICALL,
        true,
      ])
      const bundle = bundleCalls(resolutions)
      await F.shapeshift1.write.setResponse([bundle.call, bundle.answer])
      await F.shapeshift1.write.setExtended([true])
      const [answer, resolver] = await F.universalResolver.read.resolve([
        dnsEncodeName(testName),
        bundle.call,
      ])
      expectVar({ resolver }).toEqualAddress(F.shapeshift1.address)
      bundle.expect(answer)
    })

    it('offchain extended', async () => {
      const F = await loadFixture(fixture)
      await F.takeControl(testName)
      await F.ensRegistry.write.setResolver([
        namehash(getParentName(testName)),
        F.shapeshift1.address,
      ])
      await F.shapeshift1.write.setFeature([
        FEATURES.RESOLVER.RESOLVE_MULTICALL,
        true,
      ])
      const [res] = resolutions
      await F.shapeshift1.write.setResponse([res.call, res.answer])
      await F.shapeshift1.write.setExtended([true])
      await F.shapeshift1.write.setOffchain([true])
      await F.batchGatewayProvider.write.setGateways([[]]) // disable
      const [answer, resolver] = await F.universalResolver.read.resolve([
        dnsEncodeName(testName),
        res.call,
      ])
      expectVar({ resolver }).toEqualAddress(F.shapeshift1.address)
      res.expect(answer)
    })

    it('offchain extended w/multicall', async () => {
      const F = await loadFixture(fixture)
      await F.takeControl(testName)
      await F.ensRegistry.write.setResolver([
        namehash(getParentName(testName)),
        F.shapeshift1.address,
      ])
      await F.shapeshift1.write.setFeature([
        FEATURES.RESOLVER.RESOLVE_MULTICALL,
        true,
      ])
      const bundle = bundleCalls(resolutions)
      await F.shapeshift1.write.setResponse([bundle.call, bundle.answer])
      await F.shapeshift1.write.setExtended([true])
      await F.shapeshift1.write.setOffchain([true])
      await F.batchGatewayProvider.write.setGateways([[]]) // disable
      const [answer, resolver] = await F.universalResolver.read.resolve([
        dnsEncodeName(testName),
        bundle.call,
      ])
      expectVar({ resolver }).toEqualAddress(F.shapeshift1.address)
      bundle.expect(answer)
    })

    it('offchain extended w/multicall (1 revert)', async () => {
      const F = await loadFixture(fixture)
      await F.takeControl(testName)
      await F.ensRegistry.write.setResolver([
        namehash(getParentName(testName)),
        F.shapeshift1.address,
      ])
      await F.shapeshift1.write.setFeature([
        FEATURES.RESOLVER.RESOLVE_MULTICALL,
        true,
      ])
      const bundle = bundleCalls(
        makeResolutions({
          name: testName,
          primary: { value: testName },
          errors: [{ call: dummyBytes4, answer: '0x' }],
        }),
      )
      await F.shapeshift1.write.setResponse([bundle.call, bundle.answer])
      await F.shapeshift1.write.setExtended([true])
      await F.shapeshift1.write.setOffchain([true])
      await F.batchGatewayProvider.write.setGateways([[]]) // disable
      const [answer, resolver] = await F.universalResolver.read.resolve([
        dnsEncodeName(testName),
        bundle.call,
      ])
      expectVar({ resolver }).toEqualAddress(F.shapeshift1.address)
      bundle.expect(answer)
    })
  })

  it('resolveWithGateways()', async () => {
    const F = await loadFixture(fixture)
    await F.takeControl(testName)
    await F.ensRegistry.write.setResolver([
      namehash(testName),
      F.shapeshift1.address,
    ])
    const [res] = resolutions
    await F.shapeshift1.write.setResponse([res.call, res.answer])
    await F.shapeshift1.write.setExtended([true])
    const [answer, resolver] =
      await F.universalResolver.read.resolveWithGateways([
        dnsEncodeName(testName),
        res.call,
        await F.batchGatewayProvider.read.gateways(),
      ])
    expectVar({ resolver }).toEqualAddress(F.shapeshift1.address)
    res.expect(answer)
  })

  it('resolveWithResolver()', async () => {
    const F = await loadFixture(fixture)
    const [res] = resolutions
    await F.shapeshift1.write.setResponse([res.call, res.answer])
    await F.shapeshift1.write.setExtended([true])
    const answer = await F.universalResolver.read.resolveWithResolver([
      F.shapeshift1.address,
      dnsEncodeName(testName),
      res.call,
      await F.batchGatewayProvider.read.gateways(),
    ])
    res.expect(answer)
  })

  describe('reverse()', () => {
    it('empty address', async () => {
      const F = await loadFixture(fixture)
      await expect(F.universalResolver)
        .read('reverse', ['0x', COIN_TYPE_ETH])
        .toBeRevertedWithCustomError('EmptyAddress')
    })

    it('unset reverse resolver', async () => {
      const F = await loadFixture(fixture)
      const [name, resolver, reverseResolver] =
        await F.universalResolver.read.reverse([F.owner, COIN_TYPE_ETH])
      expectVar({ name }).toStrictEqual('')
      expectVar({ resolver }).toEqualAddress(zeroAddress)
      expectVar({ reverseResolver }).toEqualAddress(
        F.defaultReverseResolver.address,
      )
    })

    it('unset forward resolver', async () => {
      const F = await loadFixture(fixture)
      const reverseName = getReverseName(F.owner)
      await F.takeControl(reverseName)
      await F.ensRegistry.write.setResolver([
        namehash(reverseName),
        F.oldResolver.address,
      ])
      await expect(F.universalResolver)
        .read('reverse', [F.owner, COIN_TYPE_ETH])
        .toBeRevertedWithCustomError('ResolverNotFound')
        .withArgs(dnsEncodeName(testName))
    })

    it('unset name()', async () => {
      const F = await loadFixture(fixture)
      const reverseName = getReverseName(F.owner)
      await F.takeControl(reverseName)
      await F.ensRegistry.write.setResolver([
        namehash(reverseName),
        F.shapeshift1.address,
      ])
      const [res] = makeResolutions({
        name: reverseName,
        primary: { value: '' },
      })
      await F.shapeshift1.write.setResponse([res.call, res.answer])
      const [name, resolver, reverseResolver] =
        await F.universalResolver.read.reverse([F.owner, COIN_TYPE_ETH])
      expectVar({ name }).toStrictEqual('')
      expectVar({ resolver }).toEqualAddress(zeroAddress)
      expectVar({ reverseResolver }).toEqualAddress(F.shapeshift1.address)
    })

    it('unimplemented name()', async () => {
      const F = await loadFixture(fixture)
      const reverseName = getReverseName(F.owner)
      await F.takeControl(reverseName)
      await F.ensRegistry.write.setResolver([
        namehash(reverseName),
        F.shapeshift1.address,
      ])
      await expect(F.universalResolver)
        .read('reverse', [F.owner, COIN_TYPE_ETH])
        .toBeRevertedWithCustomError('UnsupportedResolverProfile')
        .withArgs(toFunctionSelector('name(bytes32)'))
    })

    it('old name() + PR addr()', async () => {
      const F = await loadFixture(fixture)
      const reverseName = getReverseName(F.owner)
      await F.takeControl(reverseName)
      await F.ensRegistry.write.setResolver([
        namehash(reverseName),
        F.oldResolver.address,
      ])
      await F.takeControl(testName)
      await F.ensRegistry.write.setResolver([
        namehash(testName),
        F.publicResolver.address,
      ])
      const [res] = makeResolutions({
        name: testName,
        addresses: [{ coinType: COIN_TYPE_ETH, value: F.owner }],
      })
      await F.publicResolver.write.multicall([[res.write]])
      const [name, resolver, reverseResolver] =
        await F.universalResolver.read.reverse([F.owner, COIN_TYPE_ETH])
      expectVar({ name }).toStrictEqual(testName)
      expectVar({ resolver }).toEqualAddress(F.publicResolver.address)
      expectVar({ reverseResolver }).toEqualAddress(F.oldResolver.address)
    })

    it('PR name() + PR addr() w/fallback', async () => {
      const F = await loadFixture(fixture)
      await F.reverseRegistrar.write.setName([testName])
      await F.takeControl(testName)
      await F.ensRegistry.write.setResolver([
        namehash(testName),
        F.publicResolver.address,
      ])
      const [res] = makeResolutions({
        name: testName,
        addresses: [{ coinType: COIN_TYPE_DEFAULT, value: F.owner }],
      })
      await F.publicResolver.write.multicall([[res.write]])
      const [name, resolver, reverseResolver] =
        await F.universalResolver.read.reverse([F.owner, COIN_TYPE_ETH])
      expectVar({ name }).toStrictEqual(testName)
      expectVar({ resolver }).toEqualAddress(F.publicResolver.address)
      expectVar({ reverseResolver }).toEqualAddress(F.publicResolver.address)
    })

    it('PR name() + PR mismatch addr()', async () => {
      const F = await loadFixture(fixture)
      await F.reverseRegistrar.write.setName([testName])
      await F.takeControl(testName)
      await F.ensRegistry.write.setResolver([
        namehash(testName),
        F.publicResolver.address,
      ])
      const [res] = makeResolutions({
        name: testName,
        addresses: [{ coinType: COIN_TYPE_ETH, value: anotherAddress }],
      })
      await F.publicResolver.write.multicall([[res.write]])
      await expect(F.universalResolver)
        .read('reverse', [F.owner, COIN_TYPE_ETH])
        .toBeRevertedWithCustomError('ReverseAddressMismatch')
        .withArgs(testName, anotherAddress)
    })

    it('PR name() + old unimplemented addr()', async () => {
      const F = await loadFixture(fixture)
      const reverseName = getReverseName(F.owner)
      await F.takeControl(reverseName)
      await F.ensRegistry.write.setResolver([
        namehash(reverseName),
        F.oldResolver.address,
      ])
      await F.takeControl(testName)
      await F.ensRegistry.write.setResolver([
        namehash(testName),
        F.oldResolver.address,
      ])
      await expect(F.universalResolver)
        .read('reverse', [F.owner, COIN_TYPE_ETH])
        .toBeRevertedWithCustomError('UnsupportedResolverProfile')
        .withArgs(toFunctionSelector('addr(bytes32)'))
    })

    it('PR name() + onchain immediate unimplemented addr()', async () => {
      const F = await loadFixture(fixture)
      const reverseName = getReverseName(F.owner)
      await F.takeControl(reverseName)
      await F.ensRegistry.write.setResolver([
        namehash(reverseName),
        F.oldResolver.address,
      ])
      await F.takeControl(testName)
      await F.ensRegistry.write.setResolver([
        namehash(testName),
        F.shapeshift1.address,
      ])
      await expect(F.universalResolver)
        .read('reverse', [F.owner, COIN_TYPE_ETH])
        .toBeRevertedWithCustomError('UnsupportedResolverProfile')
        .withArgs(toFunctionSelector('addr(bytes32)'))
    })

    for (const coinType of [COIN_TYPE_ETH, COIN_TYPE_DEFAULT + 2n]) {
      const C = shortCoin(coinType)

      it(`default name() + PR addr(${C})`, async () => {
        const F = await loadFixture(fixture)
        await F.defaultReverseRegistrar.write.setName([testName])
        await F.takeControl(testName)
        await F.ensRegistry.write.setResolver([
          namehash(testName),
          F.publicResolver.address,
        ])
        const [res] = makeResolutions({
          name: testName,
          addresses: [{ coinType, value: F.owner }],
        })
        await F.publicResolver.write.multicall([[res.write]])
        const [name, resolver, reverseResolver] =
          await F.universalResolver.read.reverse([F.owner, coinType])
        expectVar({ name }).toStrictEqual(testName)
        expectVar({ resolver }).toEqualAddress(F.publicResolver.address)
        expectVar({ reverseResolver }).toEqualAddress(
          F.defaultReverseResolver.address,
        )
      })

      it(`default name() + PR addr(${C}) w/fallback`, async () => {
        const F = await loadFixture(fixture)
        await F.defaultReverseRegistrar.write.setName([testName])
        await F.takeControl(testName)
        await F.ensRegistry.write.setResolver([
          namehash(testName),
          F.publicResolver.address,
        ])
        const [res] = makeResolutions({
          name: testName,
          addresses: [{ coinType: COIN_TYPE_DEFAULT, value: F.owner }],
        })
        await F.publicResolver.write.multicall([[res.write]])
        const [name, resolver, reverseResolver] =
          await F.universalResolver.read.reverse([F.owner, coinType])
        expectVar({ name }).toStrictEqual(testName)
        expectVar({ resolver }).toEqualAddress(F.publicResolver.address)
        expectVar({ reverseResolver }).toEqualAddress(
          F.defaultReverseResolver.address,
        )
      })

      it(`offchain extended name(${C}) + PR addr()`, async () => {
        const F = await loadFixture(fixture)
        const reverseName = getReverseName(F.owner, coinType)
        await F.takeControl(reverseName)
        await F.ensRegistry.write.setResolver([
          namehash(getParentName(reverseName)),
          F.shapeshift1.address,
        ])
        const [rev] = makeResolutions({
          name: reverseName,
          primary: { value: testName },
        })
        await F.shapeshift1.write.setExtended([true])
        await F.shapeshift1.write.setOffchain([true])
        await F.shapeshift1.write.setResponse([rev.call, rev.answer])
        await F.takeControl(testName)
        await F.ensRegistry.write.setResolver([
          namehash(testName),
          F.publicResolver.address,
        ])
        const [res] = makeResolutions({
          name: testName,
          addresses: [{ coinType, value: F.owner }],
        })
        await F.publicResolver.write.multicall([[res.write]])
        const [name, resolver, reverseResolver] =
          await F.universalResolver.read.reverse([F.owner, coinType])
        expectVar({ name }).toStrictEqual(testName)
        expectVar({ resolver }).toEqualAddress(F.publicResolver.address)
        expectVar({ reverseResolver }).toEqualAddress(F.shapeshift1.address)
      })

      it(`offchain extended name(${C}) + PR addr() w/fallback`, async () => {
        const F = await loadFixture(fixture)
        const reverseName = getReverseName(F.owner, coinType)
        await F.takeControl(reverseName)
        await F.ensRegistry.write.setResolver([
          namehash(getParentName(reverseName)),
          F.shapeshift1.address,
        ])
        const [rev] = makeResolutions({
          name: reverseName,
          primary: { value: testName },
        })
        await F.shapeshift1.write.setExtended([true])
        await F.shapeshift1.write.setOffchain([true])
        await F.shapeshift1.write.setResponse([rev.call, rev.answer])
        await F.takeControl(testName)
        await F.ensRegistry.write.setResolver([
          namehash(testName),
          F.publicResolver.address,
        ])
        const [res] = makeResolutions({
          name: testName,
          addresses: [{ coinType: COIN_TYPE_DEFAULT, value: F.owner }],
        })
        await F.publicResolver.write.multicall([[res.write]])
        const [name, resolver, reverseResolver] =
          await F.universalResolver.read.reverse([F.owner, coinType])
        expectVar({ name }).toStrictEqual(testName)
        expectVar({ resolver }).toEqualAddress(F.publicResolver.address)
        expectVar({ reverseResolver }).toEqualAddress(F.shapeshift1.address)
      })
    }

    it('offchain extended name() + offchain extended addr()', async () => {
      const F = await loadFixture(fixture)
      const coinType = 123n // non-evm
      const reverseName = getReverseName(F.owner, coinType)
      await F.takeControl(reverseName)
      await F.ensRegistry.write.setResolver([
        namehash(getParentName(reverseName)),
        F.shapeshift1.address,
      ])
      const [rev] = makeResolutions({
        name: reverseName,
        primary: { value: testName },
      })
      await F.shapeshift1.write.setExtended([true])
      await F.shapeshift1.write.setOffchain([true])
      await F.shapeshift1.write.setResponse([rev.call, rev.answer])
      await F.takeControl(testName)
      await F.ensRegistry.write.setResolver([
        namehash(getParentName(testName)),
        F.shapeshift2.address,
      ])
      const [res] = makeResolutions({
        name: testName,
        addresses: [{ coinType, value: F.owner }],
      })
      await F.shapeshift2.write.setExtended([true])
      await F.shapeshift2.write.setOffchain([true])
      await F.shapeshift2.write.setResponse([res.call, res.answer])
      const [name, resolver, reverseResolver] =
        await F.universalResolver.read.reverse([F.owner, coinType])
      expectVar({ name }).toStrictEqual(testName)
      expectVar({ resolver }).toEqualAddress(F.shapeshift2.address)
      expectVar({ reverseResolver }).toEqualAddress(F.shapeshift1.address)
    })
  })
})
