import hre from 'hardhat'
import {
  decodeFunctionResult,
  encodeAbiParameters,
  encodeFunctionData,
  encodeFunctionResult,
  labelhash,
  namehash,
  zeroAddress,
} from 'viem'
import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import { dnsEncodeName } from '../fixtures/dnsEncodeName.js'
import { serveBatchedGateway } from '../fixtures/batchedGateway.js'
import { ADDR_ABI, RESOLVE_MULTICALL, RESPONSE_BITS } from './testUtils.js'

async function fixture() {
  const wallets = await hre.viem.getWalletClients()
  const owner = wallets[0].account.address

  const ENSRegistry = await hre.viem.deployContract('ENSRegistry')

  async function takeControl(name: string) {
    if (name) {
      const labels = name.split('.')
      for (let i = labels.length; i > 0; i--) {
        await ENSRegistry.write.setSubnodeOwner([
          namehash(labels.slice(i).join('.')),
          labelhash(labels[i - 1]),
          owner,
        ])
      }
    }
  }

  const bg = await serveBatchedGateway()
  after(bg.shutdown)

  const ForwardResolution = await hre.viem.deployContract('ForwardResolution', [
    ENSRegistry.address,
    [bg.batchedGatewayURL],
  ])

  const ReverseRegistrar = await hre.viem.deployContract('ReverseRegistrar', [
    ENSRegistry.address,
  ])
  await takeControl('addr.reverse')
  await ENSRegistry.write.setOwner([
    namehash('addr.reverse'),
    ReverseRegistrar.address,
  ])

  const PublicResolver = await hre.viem.deployContract('PublicResolver', [
    ENSRegistry.address,
    zeroAddress, // nameWrapper
    zeroAddress, // ethController
    ReverseRegistrar.address,
  ])
  await ReverseRegistrar.write.setDefaultResolver([PublicResolver.address])

  return {
    owner,
    ForwardResolution,
    ENSRegistry,
    PublicResolver,
    ReverseRegistrar,
    takeControl,
  }
}

const testName = 'nick.eth'

function parentOf(name: string) {
  const i = name.indexOf('.')
  return i == -1 ? '' : name.slice(i + 1)
}

describe('ForwardResolution', () => {
  it('invalid dns encoding', async () => {
    const F = await loadFixture(fixture)
    await expect(
      F.ForwardResolution.read.resolve(['0x01', [], []]),
    ).rejects.toThrow()
  })

  it('resolver does not exist', async () => {
    const F = await loadFixture(fixture)
    const [lookup] = await F.ForwardResolution.read.resolve([
      dnsEncodeName('_eth'),
      [],
      [],
    ])
    expect(lookup.resolver).toStrictEqual(zeroAddress)
  })

  it('resolver is not extended', async () => {
    const F = await loadFixture(fixture)
    await F.takeControl(testName)
    await F.ENSRegistry.write.setResolver([
      namehash(parentOf(testName)),
      F.PublicResolver.address,
    ])
    const [lookup] = await F.ForwardResolution.read.resolve([
      dnsEncodeName(testName),
      [],
      [],
    ])
    expect(lookup.resolver).toStrictEqual(zeroAddress)
  })

  it('zero calls', async () => {
    const F = await loadFixture(fixture)
    const [, results] = await F.ForwardResolution.read.resolve([
      dnsEncodeName('eth'),
      [],
      [],
    ])
    expect(results.length).toStrictEqual(0)
  })

  it('onchain normal', async () => {
    const F = await loadFixture(fixture)
    await F.takeControl(testName)
    await F.ENSRegistry.write.setResolver([
      namehash(testName),
      F.PublicResolver.address,
    ])
    await F.PublicResolver.write.setAddr([namehash(testName), F.owner])
    const [lookup, [response]] = await F.ForwardResolution.read.resolve([
      dnsEncodeName(testName),
      [
        encodeFunctionData({
          abi: ADDR_ABI,
          functionName: 'addr',
          args: [namehash(testName)],
        }),
      ],
      [],
    ])
    expect(lookup.resolver, 'resolver').toEqualAddress(F.PublicResolver.address)
    expect(lookup.extended, 'extended').toStrictEqual(false)
    expect(response.bits, 'bits').toStrictEqual(RESPONSE_BITS.RESOLVED)
    expect(
      decodeFunctionResult({
        abi: ADDR_ABI,
        functionName: 'addr',
        data: response.data,
      }),
      'result',
    ).toEqualAddress(F.owner)
  })

  it('onchain extended', async () => {
    const F = await loadFixture(fixture)
    const resolver = await hre.viem.deployContract('DummyOffchainResolver')
    await F.takeControl(parentOf(testName))
    await F.ENSRegistry.write.setResolver([
      namehash(parentOf(testName)),
      resolver.address,
    ])
    const [lookup, [response]] = await F.ForwardResolution.read.resolve([
      dnsEncodeName(testName),
      ['0x12345678'],
      [],
    ])
    expect(lookup.resolver, 'resolver').toEqualAddress(resolver.address)
    expect(lookup.extended, 'extended').toStrictEqual(true)
    expect(response.bits, 'bits').toStrictEqual(RESPONSE_BITS.RESOLVED)
  })

  it('offchain extended', async () => {
    const F = await loadFixture(fixture)
    const resolver = await hre.viem.deployContract('DummyGatewaylessResolver')
    await F.takeControl(parentOf(testName))
    await F.ENSRegistry.write.setResolver([
      namehash(parentOf(testName)),
      resolver.address,
    ])
    const call = '0x12345678'
    const answer = encodeAbiParameters([{ type: 'bytes' }], ['0xbeef'])
    await resolver.write.setOffchainResponse([call, answer])
    await resolver.write.setOffchainResponse([
      encodeFunctionData({ abi: RESOLVE_MULTICALL, args: [[call]] }),
      encodeFunctionResult({ abi: RESOLVE_MULTICALL, result: [[answer]] }),
    ])
    const [lookup, [response]] = await F.ForwardResolution.read.resolve([
      dnsEncodeName(testName),
      [call],
      [],
    ])
    expect(lookup.resolver, 'resolver').toEqualAddress(resolver.address)
    expect(lookup.extended, 'extended').toStrictEqual(true)
    expect(response.bits, 'bits').toStrictEqual(
      RESPONSE_BITS.RESOLVED | RESPONSE_BITS.OFFCHAIN,
    )
    expect(response.data, 'data').toStrictEqual(answer)
  })

  it('offchain extended batched', async () => {
    const F = await loadFixture(fixture)
    const resolver = await hre.viem.deployContract('DummyGatewaylessResolver')
    await F.takeControl(parentOf(testName))
    await F.ENSRegistry.write.setResolver([
      namehash(parentOf(testName)),
      resolver.address,
    ])
    const call = '0x12345678'
    const answer = '0xbeef'
    await resolver.write.setOffchainResponse([call, answer])
    const [lookup, [response]] = await F.ForwardResolution.read.resolve([
      dnsEncodeName(testName),
      [call],
      [],
    ])
    expect(lookup.resolver, 'resolver').toEqualAddress(resolver.address)
    expect(lookup.extended, 'extended').toStrictEqual(true)
    expect(response.bits, 'bits').toStrictEqual(
      RESPONSE_BITS.RESOLVED | RESPONSE_BITS.OFFCHAIN | RESPONSE_BITS.BATCHED,
    )
    expect(response.data, 'data').toStrictEqual(answer)
  })

  //   it('{addr}.addr.reverse', async () => {
  //     const F = await loadFixture(fixture)
  //     await F.takeControl(fwdName)
  //     await F.ensRegistry.write.setResolver([
  //       namehash(fwdName),
  //       F.publicResolver.address,
  //     ])
  //     await F.dummyGR.write.setAddr([namehash(fwdName), F.owner])
  //     await F.reverseRegistrar.write.setName([fwdName])

  //     //await F.takeControl(reverseName)
  //     //await F.setRecord(forwardName, F.publicResolver.address);
  //     //await F.publicResolver.write.setName([namehash(node), ''
  //   })
})
