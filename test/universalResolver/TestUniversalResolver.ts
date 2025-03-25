import hre from 'hardhat'
import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import {
  encodeErrorResult,
  HttpRequestError,
  keccak256,
  namehash,
  parseAbi,
  toBytes,
  toFunctionSelector,
  toHex,
  zeroAddress,
} from 'viem'
import { dnsEncodeName } from '../fixtures/dnsEncodeName.js'
import { serveBatchGateway } from '../fixtures/localBatchGateway.js'
import { COIN_TYPE_ETH, getReverseName } from '../fixtures/ensip19.js'
import { ownedEnsFixture } from './ownedEnsFixture.js'
import { expectVar } from '../fixtures/expectVar.js'
import { makeResolutions, bundleCalls, getParentName } from './utils.js'

async function fixture() {
  const ens = await ownedEnsFixture()
  const bg = await serveBatchGateway()
  after(bg.shutdown)
  const UniversalResolver = await hre.viem.deployContract(
    'UniversalResolver',
    [ens.ENSRegistry.address, [bg.localBatchGatewayUrl]],
    {
      client: {
        public: await hre.viem.getPublicClient({ ccipRead: undefined }),
      },
    },
  )
  return { UniversalResolver, ...ens }
}

const dummyCalldata = '0x12345678'
const testName = 'test.eth' // DummyResolver name
const anotherAddress = '0x8000000000000000000000000000000000000001'
const resolutions = makeResolutions({
  name: testName,
  addresses: [
    {
      coinType: COIN_TYPE_ETH,
      encodedAddress: anotherAddress,
    },
  ],
  texts: [{ key: 'description', value: 'Test' }],
})

describe('UniversalResolver', () => {
  describe('findResolver()', () => {
    it('unset', async () => {
      const F = await loadFixture(fixture)
      await F.takeControl(testName)
      const [resolver, node, offset] =
        await F.UniversalResolver.read.findResolver([dnsEncodeName(testName)])
      expectVar({ resolver }).toEqualAddress(zeroAddress)
      expectVar({ node }).toStrictEqual(namehash(testName))
      expectVar({ offset }).toStrictEqual(0n)
    })

    it('immediate', async () => {
      const F = await loadFixture(fixture)
      await F.takeControl(testName)
      await F.ENSRegistry.write.setResolver([
        namehash(testName),
        F.Shapeshift1.address,
      ])
      const [resolver, node, offset] =
        await F.UniversalResolver.read.findResolver([dnsEncodeName(testName)])
      expectVar({ resolver }).toEqualAddress(F.Shapeshift1.address)
      expectVar({ node }).toStrictEqual(namehash(testName))
      expectVar({ offset }).toStrictEqual(0n)
    })

    it('extended', async () => {
      const F = await loadFixture(fixture)
      await F.takeControl(testName)
      await F.ENSRegistry.write.setResolver([
        namehash(getParentName(testName)),
        F.Shapeshift1.address,
      ])
      await F.Shapeshift1.write.setExtended([true])
      const [resolver, node, offset] =
        await F.UniversalResolver.read.findResolver([dnsEncodeName(testName)])
      expectVar({ resolver }).toEqualAddress(F.Shapeshift1.address)
      expectVar({ node }).toStrictEqual(namehash(testName))
      expectVar({ offset }).toStrictEqual(
        BigInt(1 + toBytes(testName.split('.')[0]).length),
      )
    })

    it('auto-encrypted', async () => {
      const F = await loadFixture(fixture)
      const name = `${'1'.repeat(300)}.${testName}`
      await F.takeControl(name)
      await F.ENSRegistry.write.setResolver([
        namehash(name),
        F.Shapeshift1.address,
      ])
      const [resolver, node, offset] =
        await F.UniversalResolver.read.findResolver([dnsEncodeName(name)])
      expectVar({ resolver }).toEqualAddress(F.Shapeshift1.address)
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
      await F.ENSRegistry.write.setResolver([
        namehash(name),
        F.Shapeshift1.address,
      ])
      const [resolver, node, offset] =
        await F.UniversalResolver.read.findResolver([dnsEncodeName(name)])
      expectVar({ resolver }).toEqualAddress(F.Shapeshift1.address)
      expectVar({ node }).toStrictEqual(namehash(name))
      expectVar({ offset }).toStrictEqual(0n)
    })
  })

  describe('resolve()', () => {
    it('unset', async () => {
      const F = await loadFixture(fixture)
      await expect(F.UniversalResolver)
        .read('resolve', [dnsEncodeName(testName), dummyCalldata])
        .toBeRevertedWithCustomError('ResolverNotFound')
        .withArgs(dnsEncodeName(testName))
    })

    it('not extended', async () => {
      const F = await loadFixture(fixture)
      await F.takeControl(testName)
      await F.ENSRegistry.write.setResolver([
        namehash(getParentName(testName)),
        F.owner,
      ])
      await expect(F.UniversalResolver)
        .read('resolve', [dnsEncodeName(testName), dummyCalldata])
        .toBeRevertedWithCustomError('ResolverNotFound')
        .withArgs(dnsEncodeName(testName))
    })

    it('not a contract', async () => {
      const F = await loadFixture(fixture)
      await F.takeControl(testName)
      await F.ENSRegistry.write.setResolver([namehash(testName), F.owner])
      await expect(F.UniversalResolver)
        .read('resolve', [dnsEncodeName(testName), dummyCalldata])
        .toBeRevertedWithCustomError('ResolverNotContract')
        .withArgs(dnsEncodeName(testName), F.owner)
    })

    it('empty response', async () => {
      const F = await loadFixture(fixture)
      await F.takeControl(testName)
      await F.ENSRegistry.write.setResolver([
        namehash(testName),
        F.Shapeshift1.address,
      ])
      await expect(F.UniversalResolver)
        .read('resolve', [dnsEncodeName(testName), dummyCalldata])
        .toBeRevertedWithCustomError('UnsupportedResolverProfile')
        .withArgs(dummyCalldata)
    })

    it('empty revert', async () => {
      const F = await loadFixture(fixture)
      await F.takeControl(testName)
      await F.ENSRegistry.write.setResolver([
        namehash(testName),
        F.Shapeshift1.address,
      ])
      await F.Shapeshift1.write.setRevertEmpty([true])
      await expect(F.UniversalResolver)
        .read('resolve', [dnsEncodeName(testName), dummyCalldata])
        .toBeRevertedWithCustomError('ResolverError')
        .withArgs('0x')
    })

    it('resolver revert', async () => {
      const F = await loadFixture(fixture)
      await F.takeControl(testName)
      await F.ENSRegistry.write.setResolver([
        namehash(testName),
        F.Shapeshift1.address,
      ])
      await F.Shapeshift1.write.setResponse([dummyCalldata, dummyCalldata])
      await expect(F.UniversalResolver)
        .read('resolve', [dnsEncodeName(testName), dummyCalldata])
        .toBeRevertedWithCustomError('ResolverError')
        .withArgs(dummyCalldata)
    })

    it('batch gateway revert', async () => {
      const F = await loadFixture(fixture)
      const bg = await serveBatchGateway(() => {
        throw new HttpRequestError({ status: 400, url: '' })
      })
      after(bg.shutdown)
      await F.takeControl(testName)
      await F.ENSRegistry.write.setResolver([
        namehash(testName),
        F.Shapeshift1.address,
      ])
      await F.Shapeshift1.write.setResponse([dummyCalldata, dummyCalldata])
      await F.Shapeshift1.write.setOffchain([true])
      await expect(F.UniversalResolver)
        .read('resolveWithGateways', [
          dnsEncodeName(testName),
          dummyCalldata,
          [bg.localBatchGatewayUrl],
        ])
        .toBeRevertedWithCustomError('HttpError')
        .withArgs(400, 'HTTP request failed.')
    })

    it('unsupported revert', async () => {
      const F = await loadFixture(fixture)
      await F.takeControl(testName)
      await F.ENSRegistry.write.setResolver([
        namehash(testName),
        F.Shapeshift1.address,
      ])
      await F.Shapeshift1.write.setRevertUnsupportedResolverProfile([true])
      await expect(F.UniversalResolver)
        .read('resolve', [dnsEncodeName(testName), dummyCalldata])
        .toBeRevertedWithCustomError('UnsupportedResolverProfile')
        .withArgs(dummyCalldata)
    })

    it('old', async () => {
      const F = await loadFixture(fixture)
      await F.takeControl(testName)
      await F.ENSRegistry.write.setResolver([
        namehash(testName),
        F.OldResolver.address,
      ])
      const [res] = makeResolutions({
        name: testName,
        primary: {
          name: testName,
        },
      })
      const [answer, resolver] = await F.UniversalResolver.read.resolve([
        dnsEncodeName(testName),
        res.call,
      ])
      expectVar({ resolver }).toEqualAddress(F.OldResolver.address)
      expectVar({ answer }).toStrictEqual(res.answer)
      res.expect(answer)
    })

    it('old w/multicall (1 revert)', async () => {
      const F = await loadFixture(fixture)
      await F.takeControl(testName)
      await F.ENSRegistry.write.setResolver([
        namehash(testName),
        F.OldResolver.address,
      ])
      const bundle = bundleCalls(
        makeResolutions({
          name: testName,
          primary: {
            name: testName,
          },
          errors: [
            {
              call: dummyCalldata,
              answer: '0x',
            },
          ],
        }),
      )
      const [answer, resolver] = await F.UniversalResolver.read.resolve([
        dnsEncodeName(testName),
        bundle.call,
      ])
      expectVar({ resolver }).toEqualAddress(F.OldResolver.address)
      expectVar({ answer }).toStrictEqual(bundle.answer)
      bundle.expect(answer)
    })

    it('onchain immediate', async () => {
      const F = await loadFixture(fixture)
      await F.takeControl(testName)
      await F.ENSRegistry.write.setResolver([
        namehash(testName),
        F.Shapeshift1.address,
      ])
      const res = resolutions[0]
      await F.Shapeshift1.write.setResponse([res.call, res.answer])
      const [answer, resolver] = await F.UniversalResolver.read.resolve([
        dnsEncodeName(testName),
        res.call,
      ])
      expectVar({ resolver }).toEqualAddress(F.Shapeshift1.address)
      expectVar({ answer }).toStrictEqual(res.answer)
      res.expect(answer)
    })

    it('onchain immediate w/multicall', async () => {
      const F = await loadFixture(fixture)
      await F.takeControl(testName)
      await F.ENSRegistry.write.setResolver([
        namehash(testName),
        F.Shapeshift1.address,
      ])
      const bundle = bundleCalls(resolutions)
      for (const res of resolutions) {
        await F.Shapeshift1.write.setResponse([res.call, res.answer])
      }
      const [answer, resolver] = await F.UniversalResolver.read.resolve([
        dnsEncodeName(testName),
        bundle.call,
      ])
      expectVar({ resolver }).toEqualAddress(F.Shapeshift1.address)
      expectVar({ answer }).toStrictEqual(bundle.answer)
      bundle.expect(answer)
    })

    it('onchain extended', async () => {
      const F = await loadFixture(fixture)
      await F.takeControl(testName)
      await F.ENSRegistry.write.setResolver([
        namehash(getParentName(testName)),
        F.Shapeshift1.address,
      ])
      const res = resolutions[0]
      await F.Shapeshift1.write.setResponse([res.call, res.answer])
      await F.Shapeshift1.write.setExtended([true])
      const [answer, resolver] = await F.UniversalResolver.read.resolve([
        dnsEncodeName(testName),
        res.call,
      ])
      expectVar({ resolver }).toEqualAddress(F.Shapeshift1.address)
      expectVar({ answer }).toStrictEqual(res.answer)
      res.expect(answer)
    })

    it('onchain extended w/multicall', async () => {
      const F = await loadFixture(fixture)
      await F.takeControl(testName)
      await F.ENSRegistry.write.setResolver([
        namehash(getParentName(testName)),
        F.Shapeshift1.address,
      ])
      const bundle = bundleCalls(resolutions)
      for (const res of resolutions) {
        await F.Shapeshift1.write.setResponse([res.call, res.answer])
      }
      await F.Shapeshift1.write.setExtended([true])
      const [answer, resolver] = await F.UniversalResolver.read.resolve([
        dnsEncodeName(testName),
        bundle.call,
      ])
      expectVar({ resolver }).toEqualAddress(F.Shapeshift1.address)
      expectVar({ answer }).toStrictEqual(bundle.answer)
      bundle.expect(answer)
    })

    it('offchain immediate', async () => {
      const F = await loadFixture(fixture)
      await F.takeControl(testName)
      await F.ENSRegistry.write.setResolver([
        namehash(testName),
        F.Shapeshift1.address,
      ])
      const res = resolutions[0]
      await F.Shapeshift1.write.setResponse([res.call, res.answer])
      await F.Shapeshift1.write.setOffchain([true])
      const [answer, resolver] = await F.UniversalResolver.read.resolve([
        dnsEncodeName(testName),
        res.call,
      ])
      expectVar({ resolver }).toEqualAddress(F.Shapeshift1.address)
      expectVar({ answer }).toStrictEqual(res.answer)
      res.expect(answer)
    })

    it('offchain immediate w/multicall', async () => {
      const F = await loadFixture(fixture)
      await F.takeControl(testName)
      await F.ENSRegistry.write.setResolver([
        namehash(testName),
        F.Shapeshift1.address,
      ])
      const bundle = bundleCalls(resolutions)
      for (const res of resolutions) {
        await F.Shapeshift1.write.setResponse([res.call, res.answer])
      }
      await F.Shapeshift1.write.setOffchain([true])
      const [answer, resolver] = await F.UniversalResolver.read.resolve([
        dnsEncodeName(testName),
        bundle.call,
      ])
      expectVar({ resolver }).toEqualAddress(F.Shapeshift1.address)
      expectVar({ answer }).toStrictEqual(bundle.answer)
      bundle.expect(answer)
    })

    it('offchain extended', async () => {
      const F = await loadFixture(fixture)
      await F.takeControl(testName)
      await F.ENSRegistry.write.setResolver([
        namehash(getParentName(testName)),
        F.Shapeshift1.address,
      ])
      const res = resolutions[0]
      await F.Shapeshift1.write.setResponse([res.call, res.answer])
      await F.Shapeshift1.write.setExtended([true])
      await F.Shapeshift1.write.setOffchain([true])
      const [answer, resolver] = await F.UniversalResolver.read.resolve([
        dnsEncodeName(testName),
        res.call,
      ])
      expectVar({ resolver }).toEqualAddress(F.Shapeshift1.address)
      expectVar({ answer }).toStrictEqual(res.answer)
      res.expect(answer)
    })

    it('offchain extended w/multicall', async () => {
      const F = await loadFixture(fixture)
      await F.takeControl(testName)
      await F.ENSRegistry.write.setResolver([
        namehash(getParentName(testName)),
        F.Shapeshift1.address,
      ])
      const bundle = bundleCalls(resolutions)
      for (const res of resolutions) {
        await F.Shapeshift1.write.setResponse([res.call, res.answer])
      }
      await F.Shapeshift1.write.setExtended([true])
      await F.Shapeshift1.write.setOffchain([true])
      const [answer, resolver] = await F.UniversalResolver.read.resolve([
        dnsEncodeName(testName),
        bundle.call,
      ])
      expectVar({ resolver }).toEqualAddress(F.Shapeshift1.address)
      expectVar({ answer }).toStrictEqual(bundle.answer)
      bundle.expect(answer)
    })

    it('offchain extended w/multicall (1 revert)', async () => {
      const F = await loadFixture(fixture)
      await F.takeControl(testName)
      await F.ENSRegistry.write.setResolver([
        namehash(getParentName(testName)),
        F.Shapeshift1.address,
      ])
      const calls = makeResolutions({
        name: testName,
        primary: {
          name: testName,
        },
        errors: [
          {
            call: dummyCalldata,
            answer: encodeErrorResult({
              abi: parseAbi(['error UnsupportedResolverProfile(bytes4)']),
              args: [dummyCalldata],
            }),
          },
        ],
      })
      const bundle = bundleCalls(calls)
      for (const res of calls) {
        await F.Shapeshift1.write.setResponse([res.call, res.answer])
      }
      await F.Shapeshift1.write.setExtended([true])
      await F.Shapeshift1.write.setOffchain([true])
      const [answer, resolver] = await F.UniversalResolver.read.resolve([
        dnsEncodeName(testName),
        bundle.call,
      ])
      expectVar({ resolver }).toEqualAddress(F.Shapeshift1.address)
      expectVar({ answer }).toStrictEqual(bundle.answer)
      bundle.expect(answer)
    })
  })

  describe('reverse()', () => {
    it('empty address', async () => {
      const F = await loadFixture(fixture)
      await expect(F.UniversalResolver)
        .read('reverse', ['0x', COIN_TYPE_ETH])
        .toBeRevertedWithCustomError('EmptyAddress')
    })

    it('unset reverse resolver', async () => {
      const F = await loadFixture(fixture)
      await expect(F.UniversalResolver)
        .read('reverse', [F.owner, COIN_TYPE_ETH])
        .toBeRevertedWithCustomError('ResolverNotFound')
        .withArgs(dnsEncodeName(getReverseName(F.owner, COIN_TYPE_ETH)))
    })

    it('unset primary resolver', async () => {
      const F = await loadFixture(fixture)
      const reverseName = getReverseName(F.owner)
      await F.takeControl(reverseName)
      await F.ENSRegistry.write.setResolver([
        namehash(reverseName),
        F.OldResolver.address,
      ])
      await expect(F.UniversalResolver)
        .read('reverse', [F.owner, COIN_TYPE_ETH])
        .toBeRevertedWithCustomError('ResolverNotFound')
        .withArgs(dnsEncodeName(testName))
    })

    it('unset name()', async () => {
      const F = await loadFixture(fixture)
      const reverseName = getReverseName(F.owner)
      await F.takeControl(reverseName)
      await F.ENSRegistry.write.setResolver([
        namehash(reverseName),
        F.Shapeshift1.address,
      ])
      const [res] = makeResolutions({
        name: reverseName,
        primary: { name: '' },
      })
      await F.Shapeshift1.write.setResponse([res.call, res.answer])
      const [name, resolver, reverseResolver] =
        await F.UniversalResolver.read.reverse([F.owner, COIN_TYPE_ETH])
      expectVar({ name }).toStrictEqual('')
      expectVar({ resolver }).toEqualAddress(zeroAddress)
      expectVar({ reverseResolver }).toEqualAddress(F.Shapeshift1.address)
    })

    it('unimplemented name()', async () => {
      const F = await loadFixture(fixture)
      const reverseName = getReverseName(F.owner)
      await F.takeControl(reverseName)
      await F.ENSRegistry.write.setResolver([
        namehash(reverseName),
        F.Shapeshift1.address,
      ])
      await expect(F.UniversalResolver)
        .read('reverse', [F.owner, COIN_TYPE_ETH])
        .toBeRevertedWithCustomError('UnsupportedResolverProfile')
        .withArgs(toFunctionSelector('name(bytes32)'))
    })

    it('onchain immediate name() + onchain immediate addr()', async () => {
      const F = await loadFixture(fixture)
      const reverseName = getReverseName(F.owner)
      await F.takeControl(reverseName)
      await F.ENSRegistry.write.setResolver([
        namehash(reverseName),
        F.OldResolver.address,
      ])
      await F.takeControl(testName)
      await F.ENSRegistry.write.setResolver([
        namehash(testName),
        F.Shapeshift1.address,
      ])
      const [res] = makeResolutions({
        name: testName,
        addresses: [
          {
            coinType: COIN_TYPE_ETH,
            encodedAddress: F.owner,
          },
        ],
      })
      await F.Shapeshift1.write.setResponse([res.call, res.answer])
      const [name, resolver, reverseResolver] =
        await F.UniversalResolver.read.reverse([F.owner, COIN_TYPE_ETH])
      expectVar({ name }).toStrictEqual(testName)
      expectVar({ resolver }).toEqualAddress(F.Shapeshift1.address)
      expectVar({ reverseResolver }).toEqualAddress(F.OldResolver.address)
    })

    it('onchain immediate name() + onchain immediate mismatch addr()', async () => {
      const F = await loadFixture(fixture)
      const reverseName = getReverseName(F.owner)
      await F.takeControl(reverseName)
      await F.ENSRegistry.write.setResolver([
        namehash(reverseName),
        F.OldResolver.address,
      ])
      await F.takeControl(testName)
      await F.ENSRegistry.write.setResolver([
        namehash(testName),
        F.Shapeshift1.address,
      ])
      const [res] = makeResolutions({
        name: testName,
        addresses: [
          {
            coinType: COIN_TYPE_ETH,
            encodedAddress: anotherAddress,
          },
        ],
      })
      await F.Shapeshift1.write.setResponse([res.call, res.answer])
      await expect(F.UniversalResolver)
        .read('reverse', [F.owner, COIN_TYPE_ETH])
        .toBeRevertedWithCustomError('ReverseAddressMismatch')
        .withArgs(testName, anotherAddress)
    })

    it('onchain immediate name() + old unimplemented addr()', async () => {
      const F = await loadFixture(fixture)
      const reverseName = getReverseName(F.owner)
      await F.takeControl(reverseName)
      await F.ENSRegistry.write.setResolver([
        namehash(reverseName),
        F.OldResolver.address,
      ])
      await F.takeControl(testName)
      await F.ENSRegistry.write.setResolver([
        namehash(testName),
        F.OldResolver.address,
      ])
      await expect(F.UniversalResolver)
        .read('reverse', [F.owner, COIN_TYPE_ETH])
        .toBeRevertedWithCustomError('UnsupportedResolverProfile')
        .withArgs(toFunctionSelector('addr(bytes32)'))
    })

    it('onchain immediate name() + onchain immediate unimplemented addr()', async () => {
      const F = await loadFixture(fixture)
      const reverseName = getReverseName(F.owner)
      await F.takeControl(reverseName)
      await F.ENSRegistry.write.setResolver([
        namehash(reverseName),
        F.OldResolver.address,
      ])
      await F.takeControl(testName)
      await F.ENSRegistry.write.setResolver([
        namehash(testName),
        F.Shapeshift1.address,
      ])
      await expect(F.UniversalResolver)
        .read('reverse', [F.owner, COIN_TYPE_ETH])
        .toBeRevertedWithCustomError('UnsupportedResolverProfile')
        .withArgs(toFunctionSelector('addr(bytes32)'))
    })

    it('offchain extended name() + onchain immediate addr()', async () => {
      const F = await loadFixture(fixture)
      const reverseName = getReverseName(F.owner)
      await F.takeControl(reverseName)
      await F.ENSRegistry.write.setResolver([
        namehash(getParentName(reverseName)),
        F.Shapeshift1.address,
      ])
      const [rev] = makeResolutions({
        name: reverseName,
        primary: { name: testName },
      })
      await F.Shapeshift1.write.setExtended([true])
      await F.Shapeshift1.write.setOffchain([true])
      await F.Shapeshift1.write.setResponse([rev.call, rev.answer])
      await F.takeControl(testName)
      await F.ENSRegistry.write.setResolver([
        namehash(testName),
        F.Shapeshift2.address,
      ])
      const [res] = makeResolutions({
        name: testName,
        addresses: [
          {
            coinType: COIN_TYPE_ETH,
            encodedAddress: F.owner,
          },
        ],
      })
      await F.Shapeshift2.write.setResponse([res.call, res.answer])
      const [name, resolver, reverseResolver] =
        await F.UniversalResolver.read.reverse([F.owner, COIN_TYPE_ETH])
      expectVar({ name }).toStrictEqual(testName)
      expectVar({ resolver }).toEqualAddress(F.Shapeshift2.address)
      expectVar({ reverseResolver }).toEqualAddress(F.Shapeshift1.address)
    })

    it('offchain extended name() + offchain extended addr()', async () => {
      const F = await loadFixture(fixture)
      const coinType = 123n // non-evm
      const reverseName = getReverseName(F.owner, coinType)
      await F.takeControl(reverseName)
      await F.ENSRegistry.write.setResolver([
        namehash(getParentName(reverseName)),
        F.Shapeshift1.address,
      ])
      const [rev] = makeResolutions({
        name: reverseName,
        primary: { name: testName },
      })
      await F.Shapeshift1.write.setExtended([true])
      await F.Shapeshift1.write.setOffchain([true])
      await F.Shapeshift1.write.setResponse([rev.call, rev.answer])
      await F.takeControl(testName)
      await F.ENSRegistry.write.setResolver([
        namehash(getParentName(testName)),
        F.Shapeshift2.address,
      ])
      const [res] = makeResolutions({
        name: testName,
        addresses: [
          {
            coinType,
            encodedAddress: F.owner,
          },
        ],
      })
      await F.Shapeshift2.write.setExtended([true])
      await F.Shapeshift2.write.setOffchain([true])
      await F.Shapeshift2.write.setResponse([res.call, res.answer])
      const [name, resolver, reverseResolver] =
        await F.UniversalResolver.read.reverse([F.owner, coinType])
      expectVar({ name }).toStrictEqual(testName)
      expectVar({ resolver }).toEqualAddress(F.Shapeshift2.address)
      expectVar({ reverseResolver }).toEqualAddress(F.Shapeshift1.address)
    })
  })
})
