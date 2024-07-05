import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import hre from 'hardhat'
import {
  decodeFunctionResult,
  encodeAbiParameters,
  encodeErrorResult,
  encodeFunctionData,
  encodeFunctionResult,
  getAddress,
  getContract,
  labelhash,
  namehash,
  parseAbiItem,
  parseAbiParameters,
  toFunctionSelector,
  zeroAddress,
  zeroHash,
  type Address,
  type Hex,
  type ReadContractReturnType,
} from 'viem'
import { encodedRealAnchors } from '../fixtures/anchors.js'
import { dnsEncodeName } from '../fixtures/dnsEncodeName.js'
import {
  getReverseNode,
  getReverseNodeHash,
} from '../fixtures/getReverseNode.js'

// OffchainLookup(address sender, string[] urls, bytes callData, bytes4 callbackFunction, bytes extraData)
// This is the extraData value the universal resolver should encode
const encodeExtraData = ({
  isWildcard,
  resolver,
  gateways,
  metadata,
  extraDatas,
}: {
  isWildcard: boolean
  resolver: Address
  gateways: string[]
  metadata: Hex
  extraDatas: {
    callbackFunction: Hex
    data: Hex
  }[]
}) =>
  encodeAbiParameters(
    [
      { name: 'isWildcard', type: 'bool' },
      { name: 'resolver', type: 'address' },
      { name: 'gateways', type: 'string[]' },
      { name: 'metadata', type: 'bytes' },
      {
        name: 'extraDatas',
        type: 'tuple[]',
        components: [
          { name: 'callbackFunction', type: 'bytes4' },
          { name: 'data', type: 'bytes' },
        ],
      },
    ],
    [isWildcard, resolver, gateways, metadata, extraDatas],
  )

async function fixture() {
  const accounts = await hre.viem
    .getWalletClients()
    .then((clients) => clients.map((c) => c.account))
  const ensRegistry = await hre.viem.deployContract('ENSRegistry', [])
  const root = await hre.viem.deployContract('Root', [ensRegistry.address])
  const nameWrapper = await hre.viem.deployContract('DummyNameWrapper', [])
  const reverseRegistrar = await hre.viem.deployContract('ReverseRegistrar', [
    ensRegistry.address,
  ])

  await root.write.setController([accounts[0].address, true])
  await ensRegistry.write.setOwner([zeroHash, root.address])

  await root.write.setSubnodeOwner([labelhash('reverse'), accounts[0].address])
  await root.write.setSubnodeOwner([labelhash('eth'), accounts[0].address])
  await ensRegistry.write.setSubnodeOwner([
    namehash('reverse'),
    labelhash('addr'),
    reverseRegistrar.address,
  ])

  const publicResolver = await hre.viem.deployContract('PublicResolver', [
    ensRegistry.address,
    nameWrapper.address,
    zeroAddress,
    zeroAddress,
  ])
  const universalResolver = await hre.viem.deployContract('UniversalResolver', [
    ensRegistry.address,
    ['http://universal-offchain-resolver.local'],
  ])
  const offchainResolver = await hre.viem.deployContract(
    'DummyOffchainResolver',
    [],
  )
  const oldResolver = await hre.viem.deployContract('DummyOldResolver', [])
  const revertResolver = await hre.viem.deployContract(
    'DummyRevertResolver',
    [],
  )
  const legacyResolver = await hre.viem.deployContract('LegacyResolver', [])

  const createTestEthSub = async ({
    label,
    resolverAddress = zeroAddress,
  }: {
    label: string
    resolverAddress?: Address
  }) => {
    await ensRegistry.write.setSubnodeRecord([
      namehash('test.eth'),
      labelhash(label),
      accounts[0].address,
      resolverAddress,
      0n,
    ])
  }

  await ensRegistry.write.setSubnodeRecord([
    namehash('eth'),
    labelhash('test'),
    accounts[0].address,
    publicResolver.address,
    0n,
  ])
  await ensRegistry.write.setSubnodeRecord([
    namehash('eth'),
    labelhash('legacy-resolver'),
    accounts[0].address,
    legacyResolver.address,
    0n,
  ])
  await ensRegistry.write.setSubnodeRecord([
    namehash('test.eth'),
    labelhash('sub'),
    accounts[0].address,
    accounts[1].address,
    0n,
  ])
  await createTestEthSub({
    label: 'offchain',
    resolverAddress: offchainResolver.address,
  })
  await createTestEthSub({
    label: 'no-resolver',
  })
  await createTestEthSub({
    label: 'revert-resolver',
    resolverAddress: revertResolver.address,
  })
  await createTestEthSub({
    label: 'non-contract-resolver',
    resolverAddress: accounts[0].address,
  })

  let name = 'test.eth'
  for (let i = 0; i < 5; i += 1) {
    const parent = name
    const label = `sub${i}`
    await ensRegistry.write.setSubnodeOwner([
      namehash(parent),
      labelhash(label),
      accounts[0].address,
    ])
    name = `${label}.${name}`
  }

  await publicResolver.write.setAddr([
    namehash('test.eth'),
    accounts[1].address,
  ])
  await publicResolver.write.setText([namehash('test.eth'), 'foo', 'bar'])

  await reverseRegistrar.write.claim([accounts[0].address])
  await ensRegistry.write.setResolver([
    getReverseNodeHash(accounts[0].address),
    publicResolver.address,
  ])
  await publicResolver.write.setName([
    getReverseNodeHash(accounts[0].address),
    'test.eth',
  ])

  await reverseRegistrar.write.claim([accounts[10].address], {
    account: accounts[10],
  })
  await ensRegistry.write.setResolver(
    [getReverseNodeHash(accounts[10].address), oldResolver.address],
    { account: accounts[10] },
  )

  const batchGatewayAbi = await hre.artifacts
    .readArtifact('BatchGateway')
    .then(({ abi }) => abi)

  return {
    ensRegistry,
    nameWrapper,
    reverseRegistrar,
    publicResolver,
    universalResolver,
    offchainResolver,
    oldResolver,
    revertResolver,
    legacyResolver,
    accounts,
    batchGatewayAbi,
    root,
  }
}

describe('UniversalResolver', () => {
  describe('findResolver()', () => {
    it('should find an exact match resolver', async () => {
      const { universalResolver, publicResolver } = await loadFixture(fixture)

      await expect(
        universalResolver.read.findResolver([dnsEncodeName('test.eth')]),
      ).resolves.toMatchObject([
        getAddress(publicResolver.address),
        namehash('test.eth'),
        0n,
      ])
    })

    it('should find a resolver on a parent name', async () => {
      const { universalResolver, publicResolver } = await loadFixture(fixture)

      await expect(
        universalResolver.read.findResolver([dnsEncodeName('foo.test.eth')]),
      ).resolves.toMatchObject([
        getAddress(publicResolver.address),
        namehash('foo.test.eth'),
        4n,
      ])
    })

    it('should choose the resolver closest to the leaf', async () => {
      const { universalResolver, accounts } = await loadFixture(fixture)

      await expect(
        universalResolver.read.findResolver([dnsEncodeName('sub.test.eth')]),
      ).resolves.toMatchObject([
        getAddress(accounts[1].address),
        namehash('sub.test.eth'),
        0n,
      ])
    })

    it('should allow encoded labels', async () => {
      const { universalResolver, publicResolver } = await loadFixture(fixture)

      await expect(
        universalResolver.read.findResolver([
          dnsEncodeName(
            '[9c22ff5f21f0b81b113e63f7db6da94fedef11b2119b4088b89664fb9a3cb658].eth',
          ),
        ]),
      ).resolves.toMatchObject([
        getAddress(publicResolver.address),
        namehash('test.eth'),
        0n,
      ])
    })

    it('should find a resolver many levels up', async () => {
      const { universalResolver, publicResolver } = await loadFixture(fixture)

      await expect(
        universalResolver.read.findResolver([
          dnsEncodeName('sub4.sub3.sub2.sub1.sub0.test.eth'),
        ]),
      ).resolves.toMatchObject([
        getAddress(publicResolver.address),
        namehash('sub4.sub3.sub2.sub1.sub0.test.eth'),
        25n,
      ])
    })
  })

  describe('resolve()', () => {
    it('should resolve a record via legacy methods', async () => {
      const { universalResolver, publicResolver, accounts } = await loadFixture(
        fixture,
      )

      const args = [namehash('test.eth')] as [Hex]

      const data = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'addr',
        args,
      })

      const [result] = (await universalResolver.read.resolve([
        dnsEncodeName('test.eth'),
        data,
      ])) as ReadContractReturnType<
        (typeof universalResolver)['abi'],
        'resolve',
        [Hex, Hex]
      >

      const decodedAddress = decodeFunctionResult<
        (typeof publicResolver)['abi'],
        'addr',
        typeof args
      >({
        abi: publicResolver.abi,
        functionName: 'addr',
        data: result,
        args: [namehash('test.eth')],
      })
      expect(decodedAddress).toEqualAddress(accounts[1].address)
    })

    it('should throw if a resolver is not set on the queried name', async () => {
      const { universalResolver, publicResolver } = await loadFixture(fixture)

      const data = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'addr',
        args: [namehash('no-resolver.test.other')],
      })

      await expect(universalResolver)
        .read('resolve', [dnsEncodeName('no-resolver.test.other'), data])
        .toBeRevertedWithCustomError('ResolverNotFound')
    })

    it('should throw if a resolver is not a contract', async () => {
      const { universalResolver, publicResolver } = await loadFixture(fixture)

      const data = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'addr',
        args: [namehash('non-contract-resolver.test.eth')],
      })

      await expect(universalResolver)
        .read('resolve', [
          dnsEncodeName('non-contract-resolver.test.eth'),
          data,
        ])
        .toBeRevertedWithCustomError('ResolverNotContract')
    })

    it('should throw with revert data if resolver reverts', async () => {
      const { universalResolver, publicResolver } = await loadFixture(fixture)

      const data = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'addr',
        args: [namehash('revert-resolver.test.eth')],
      })

      const notSupportedError = encodeErrorResult({
        abi: [{ type: 'error', inputs: [{ type: 'string' }], name: 'Error' }],
        errorName: 'Error',
        args: ['Not Supported'],
      })

      await expect(universalResolver)
        .read('resolve', [dnsEncodeName('revert-resolver.test.eth'), data])
        .toBeRevertedWithCustomError('ResolverError')
        .withArgs(notSupportedError)
    })

    it('should throw if a resolver is not set on the queried name, and the found resolver does not support resolve()', async () => {
      const { universalResolver, publicResolver } = await loadFixture(fixture)

      const data = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'addr',
        args: [namehash('no-resolver.test.eth')],
      })

      await expect(universalResolver)
        .read('resolve', [dnsEncodeName('no-resolver.test.eth'), data])
        .toBeRevertedWithCustomError('ResolverWildcardNotSupported')
    })

    it('should resolve a record if supportsInterface() throws', async () => {
      const { universalResolver, publicResolver, legacyResolver } =
        await loadFixture(fixture)

      const args = [namehash('legacy-resolver.eth')] as [Hex]

      const data = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'addr',
        args,
      })

      const [result, resolverAddress] = (await universalResolver.read.resolve([
        dnsEncodeName('legacy-resolver.eth'),
        data,
      ])) as ReadContractReturnType<
        (typeof universalResolver)['abi'],
        'resolve',
        [Hex, Hex]
      >

      const decodedAddress = decodeFunctionResult<
        (typeof publicResolver)['abi'],
        'addr',
        typeof args
      >({
        abi: publicResolver.abi,
        functionName: 'addr',
        data: result,
        args,
      })
      expect(decodedAddress).toEqualAddress(legacyResolver.address)
      expect(resolverAddress).toEqualAddress(legacyResolver.address)
    })

    it('should not run out of gas if calling a non-existent function on a legacy resolver', async () => {
      const { universalResolver, publicResolver, legacyResolver } =
        await loadFixture(fixture)

      const args = [namehash('legacy-resolver.eth'), 60n] as [Hex, bigint]

      const data = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'addr',
        args,
      })

      await expect(universalResolver)
        .read('resolve', [dnsEncodeName('legacy-resolver.eth'), data])
        .toBeRevertedWithCustomError('ResolverError')
        .withArgs('0x')
    })

    it('should return a wrapped revert if the resolver reverts with OffchainLookup', async () => {
      const {
        universalResolver,
        publicResolver,
        offchainResolver,
        batchGatewayAbi,
      } = await loadFixture(fixture)

      const callData = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'addr',
        args: [namehash('offchain.test.eth')],
      })

      const extraData = encodeExtraData({
        isWildcard: false,
        resolver: offchainResolver.address,
        gateways: ['http://universal-offchain-resolver.local'],
        metadata: '0x',
        extraDatas: [
          {
            callbackFunction: toFunctionSelector(
              'function resolveCallback(bytes,bytes)',
            ),
            data: callData,
          },
        ],
      })

      const queryCalldata = encodeFunctionData({
        abi: batchGatewayAbi,
        functionName: 'query',
        args: [
          [
            {
              sender: offchainResolver.address,
              urls: ['https://example.com/'],
              callData,
            },
          ],
        ],
      })

      await expect(universalResolver)
        .read('resolve', [dnsEncodeName('offchain.test.eth'), callData])
        .toBeRevertedWithCustomError('OffchainLookup')
        .withArgs(
          getAddress(universalResolver.address),
          ['http://universal-offchain-resolver.local'],
          queryCalldata,
          toFunctionSelector('function resolveSingleCallback(bytes,bytes)'),
          extraData,
        )
    })

    it('should use custom gateways when specified', async () => {
      const { universalResolver, publicResolver } = await loadFixture(fixture)

      const args = [namehash('offchain.test.eth'), 60n] as [Hex, bigint]

      const data = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'addr',
        args,
      })

      await expect(universalResolver)
        .read('resolve', [
          dnsEncodeName('offchain.test.eth'),
          data,
          ['https://custom.local'],
        ])
        .toBeRevertedWithCustomError('OffchainLookup')
        .withArgs(
          expect.anyValue,
          ['https://custom.local'],
          expect.anyValue,
          expect.anyValue,
          expect.anyValue,
        )
    })

    it('should return a wrapped revert with resolve() wrapped calls in extraData when combining onchain and offchain', async () => {
      const {
        universalResolver,
        publicResolver,
        offchainResolver,
        batchGatewayAbi,
      } = await loadFixture(fixture)

      const addrCall = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'addr',
        args: [namehash('offchain.test.eth')],
      })
      const onchainDataCall = '0x12345678'

      const extraData = encodeExtraData({
        isWildcard: false,
        resolver: offchainResolver.address,
        gateways: ['http://universal-offchain-resolver.local'],
        metadata: '0x',
        extraDatas: [
          {
            callbackFunction: toFunctionSelector(
              'function resolveCallback(bytes,bytes)',
            ),
            data: addrCall,
          },
          {
            callbackFunction: '0x00000000',
            data: encodeFunctionData({
              abi: universalResolver.abi,
              functionName: 'resolve',
              args: [dnsEncodeName('offchain.test.eth'), onchainDataCall],
            }),
          },
        ],
      })

      const queryCalldata = encodeFunctionData({
        abi: batchGatewayAbi,
        functionName: 'query',
        args: [
          [
            {
              sender: offchainResolver.address,
              urls: ['https://example.com/'],
              callData: addrCall,
            },
          ],
        ],
      })

      await expect(universalResolver)
        .read('resolve', [
          dnsEncodeName('offchain.test.eth'),
          [addrCall, onchainDataCall],
        ])
        .toBeRevertedWithCustomError('OffchainLookup')
        .withArgs(
          getAddress(universalResolver.address),
          ['http://universal-offchain-resolver.local'],
          queryCalldata,
          toFunctionSelector('function resolveCallback(bytes,bytes)'),
          extraData,
        )
    })

    it('should revert OffchainLookup via UniversalResolver + OffchainDNSResolver', async () => {
      const {
        universalResolver,
        batchGatewayAbi,
        publicResolver,
        ensRegistry,
        root,
        accounts,
      } = await loadFixture(fixture)

      const OFFCHAIN_DNS_GATEWAY = 'https://localhost:8000/lookup'

      const dnssec = await hre.viem.deployContract('DNSSECImpl', [
        encodedRealAnchors,
      ])
      const suffixes = await hre.viem.deployContract(
        'SimplePublicSuffixList',
        [],
      )
      const dnsGatewayAbi = await hre.artifacts
        .readArtifact('IDNSGateway')
        .then(({ abi }) => abi)

      await suffixes.write.addPublicSuffixes([[dnsEncodeName('test')]])

      const offchainDnsResolver = await hre.viem.deployContract(
        'OffchainDNSResolver',
        [ensRegistry.address, dnssec.address, OFFCHAIN_DNS_GATEWAY],
      )
      const dnsRegistrar = await hre.viem.deployContract('DNSRegistrar', [
        zeroAddress, // Previous registrar
        offchainDnsResolver.address,
        dnssec.address,
        suffixes.address,
        ensRegistry.address,
      ])

      await root.write.setController([dnsRegistrar.address, true])

      await dnsRegistrar.write.enableNode([dnsEncodeName('test')])

      const name = 'test.test'

      const addrCall = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'addr',
        args: [namehash(name)],
      })
      const innerCalldata = encodeFunctionData({
        abi: dnsGatewayAbi,
        functionName: 'resolve',
        args: [dnsEncodeName(name), 16],
      })
      const queryCalldata = encodeFunctionData({
        abi: batchGatewayAbi,
        functionName: 'query',
        args: [
          [
            {
              sender: offchainDnsResolver.address,
              callData: innerCalldata,
              urls: [OFFCHAIN_DNS_GATEWAY],
            },
          ],
        ],
      })
      const innerExtraData = encodeAbiParameters(
        parseAbiParameters('bytes, bytes, bytes4'),
        [dnsEncodeName(name), addrCall, '0x00000000'],
      )
      const extraData = encodeExtraData({
        isWildcard: true,
        resolver: offchainDnsResolver.address,
        gateways: ['http://universal-offchain-resolver.local'],
        metadata: '0x',
        extraDatas: [
          {
            callbackFunction: toFunctionSelector(
              'function resolveCallback(bytes,bytes)',
            ),
            data: innerExtraData,
          },
        ],
      })

      await expect(universalResolver)
        .read('resolve', [dnsEncodeName(name), addrCall])
        .toBeRevertedWithCustomError('OffchainLookup')
        .withArgs(
          getAddress(universalResolver.address),
          ['http://universal-offchain-resolver.local'],
          queryCalldata,
          toFunctionSelector('function resolveSingleCallback(bytes,bytes)'),
          extraData,
        )
    })
  })

  describe('batch', () => {
    it('should resolve multiple records onchain', async () => {
      const { universalResolver, publicResolver, accounts } = await loadFixture(
        fixture,
      )
      const addrArgs = [namehash('test.eth')] as [Hex]
      const textData = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'text',
        args: [namehash('test.eth'), 'foo'],
      })
      const addrData = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'addr',
        args: addrArgs,
      })

      const [[textResultEncoded, addrResultEncoded]] =
        (await universalResolver.read.resolve([
          dnsEncodeName('test.eth'),
          [textData, addrData],
        ])) as ReadContractReturnType<
          (typeof universalResolver)['abi'],
          'resolve',
          [Hex, Hex[]]
        >

      expect(textResultEncoded.success).toBe(true)
      expect(addrResultEncoded.success).toBe(true)

      const textResult = decodeFunctionResult({
        abi: publicResolver.abi,
        functionName: 'text',
        data: textResultEncoded.returnData,
        args: [namehash('test.eth'), 'foo'],
      })
      const addrResult = decodeFunctionResult<
        (typeof publicResolver)['abi'],
        'addr',
        typeof addrArgs
      >({
        abi: publicResolver.abi,
        functionName: 'addr',
        data: addrResultEncoded.returnData,
        args: addrArgs,
      })

      expect(textResult).toEqual('bar')
      expect(addrResult).toEqualAddress(accounts[1].address)
    })

    it('should resolve multiple records offchain', async () => {
      const {
        universalResolver,
        publicResolver,
        offchainResolver,
        batchGatewayAbi,
      } = await loadFixture(fixture)

      const addrArgs = [namehash('offchain.test.eth')] as [Hex]
      const textData = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'text',
        args: [namehash('offchain.test.eth'), 'foo'],
      })
      const addrData = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'addr',
        args: addrArgs,
      })

      const extraData = encodeExtraData({
        isWildcard: false,
        resolver: offchainResolver.address,
        gateways: ['http://universal-offchain-resolver.local'],
        metadata: '0x',
        extraDatas: [
          {
            callbackFunction: toFunctionSelector(
              'function resolveCallback(bytes,bytes)',
            ),
            data: textData,
          },
          {
            callbackFunction: toFunctionSelector(
              'function resolveCallback(bytes,bytes)',
            ),
            data: addrData,
          },
        ],
      })

      const queryCalldata = encodeFunctionData({
        abi: batchGatewayAbi,
        functionName: 'query',
        args: [
          [
            {
              sender: offchainResolver.address,
              urls: ['https://example.com/'],
              callData: textData,
            },
            {
              sender: offchainResolver.address,
              urls: ['https://example.com/'],
              callData: addrData,
            },
          ],
        ],
      })

      await expect(universalResolver)
        .read('resolve', [
          dnsEncodeName('offchain.test.eth'),
          [textData, addrData],
        ])
        .toBeRevertedWithCustomError('OffchainLookup')
        .withArgs(
          getAddress(universalResolver.address),
          ['http://universal-offchain-resolver.local'],
          queryCalldata,
          toFunctionSelector('function resolveCallback(bytes,bytes)'),
          extraData,
        )
    })
  })

  describe('resolveSingleCallback()', () => {
    it('should resolve a record via a callback from offchain lookup', async () => {
      const {
        universalResolver,
        publicResolver,
        offchainResolver,
        batchGatewayAbi,
      } = await loadFixture(fixture)

      const addrArgs = [namehash('offchain.test.eth')] as [Hex]
      const addrData = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'addr',
        args: addrArgs,
      })

      const extraData = encodeExtraData({
        isWildcard: false,
        resolver: offchainResolver.address,
        gateways: ['http://universal-offchain-resolver.local'],
        metadata: '0x',
        extraDatas: [
          {
            callbackFunction: toFunctionSelector(
              'function resolveCallback(bytes,bytes)',
            ),
            data: addrData,
          },
        ],
      })

      const response = encodeFunctionResult({
        abi: batchGatewayAbi,
        functionName: 'query',
        result: [[false], [addrData]],
      })

      const [encodedAddr, resolverAddress] =
        await universalResolver.read.resolveSingleCallback([
          response,
          extraData,
        ])

      expect(resolverAddress).toEqualAddress(offchainResolver.address)

      const decodedAddress = decodeFunctionResult<
        (typeof publicResolver)['abi'],
        'addr',
        typeof addrArgs
      >({
        abi: publicResolver.abi,
        functionName: 'addr',
        data: encodedAddr,
        args: addrArgs,
      })
      expect(decodedAddress).toEqualAddress(offchainResolver.address)
    })

    it('should propagate HttpError', async () => {
      const { universalResolver, offchainResolver, batchGatewayAbi } =
        await loadFixture(fixture)

      const publicClient = await hre.viem.getPublicClient()

      const universalResolverWithHttpError = getContract({
        abi: [
          ...universalResolver.abi,
          parseAbiItem('error HttpError((uint16,string)[])'),
        ],
        address: universalResolver.address,
        client: publicClient,
      })

      const errorData = encodeErrorResult({
        abi: universalResolverWithHttpError.abi,
        errorName: 'HttpError',
        args: [[[404, 'Not Found']]],
      })

      const extraData = encodeExtraData({
        isWildcard: false,
        resolver: offchainResolver.address,
        gateways: ['http://universal-offchain-resolver.local'],
        metadata: '0x',
        extraDatas: [
          {
            callbackFunction: toFunctionSelector(
              'function resolveCallback(bytes,bytes)',
            ),
            data: errorData,
          },
        ],
      })

      const response = encodeFunctionResult({
        abi: batchGatewayAbi,
        functionName: 'query',
        result: [[true], [errorData]],
      })

      await expect(universalResolverWithHttpError)
        .read('resolveSingleCallback', [response, extraData])
        .toBeRevertedWithCustomError('HttpError')
        .withArgs([[404, 'Not Found']])
    })
  })

  describe('resolveCallback', () => {
    it('should resolve records via a callback from offchain lookup', async () => {
      const {
        universalResolver,
        publicResolver,
        offchainResolver,
        batchGatewayAbi,
      } = await loadFixture(fixture)

      const addrArgs = [namehash('offchain.test.eth')] as [Hex]
      const addrData = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'addr',
        args: addrArgs,
      })

      const extraData = encodeExtraData({
        isWildcard: false,
        resolver: offchainResolver.address,
        gateways: ['http://universal-offchain-resolver.local'],
        metadata: '0x',
        extraDatas: [
          {
            callbackFunction: toFunctionSelector(
              'function resolveCallback(bytes,bytes)',
            ),
            data: addrData,
          },
          {
            callbackFunction: toFunctionSelector(
              'function resolveCallback(bytes,bytes)',
            ),
            data: addrData,
          },
        ],
      })

      const response = encodeFunctionResult({
        abi: batchGatewayAbi,
        functionName: 'query',
        result: [
          [false, false],
          [addrData, addrData],
        ],
      })

      const [[encodedAddr, encodedAddrTwo], resolverAddress] =
        await universalResolver.read.resolveCallback([response, extraData])

      expect(resolverAddress).toEqualAddress(offchainResolver.address)

      expect(encodedAddr.success).toBe(true)
      expect(encodedAddrTwo.success).toBe(true)

      const addrResult = decodeFunctionResult<
        (typeof publicResolver)['abi'],
        'addr',
        typeof addrArgs
      >({
        abi: publicResolver.abi,
        functionName: 'addr',
        data: encodedAddr.returnData,
        args: addrArgs,
      })
      const addrResultTwo = decodeFunctionResult<
        (typeof publicResolver)['abi'],
        'addr',
        typeof addrArgs
      >({
        abi: publicResolver.abi,
        functionName: 'addr',
        data: encodedAddrTwo.returnData,
        args: addrArgs,
      })

      expect(addrResult).toEqualAddress(offchainResolver.address)
      expect(addrResultTwo).toEqualAddress(offchainResolver.address)
    })

    it('should not revert if there is an error in a call', async () => {
      const { universalResolver, offchainResolver, batchGatewayAbi } =
        await loadFixture(fixture)

      const extraData = encodeExtraData({
        isWildcard: false,
        resolver: offchainResolver.address,
        gateways: ['http://universal-offchain-resolver.local'],
        metadata: '0x',
        extraDatas: [
          {
            callbackFunction: toFunctionSelector(
              'function resolveCallback(bytes,bytes)',
            ),
            data: '0x',
          },
        ],
      })
      const response = encodeFunctionResult({
        abi: batchGatewayAbi,
        functionName: 'query',
        result: [[true], ['0x']],
      })

      const [[encodedResult], resolverAddress] =
        await universalResolver.read.resolveCallback([response, extraData])

      expect(resolverAddress).toEqualAddress(offchainResolver.address)
      expect(encodedResult.success).toBe(false)
      expect(encodedResult.returnData).toEqual('0x')
    })

    it('should allow response at non-0 extraData index', async () => {
      const {
        universalResolver,
        offchainResolver,
        publicResolver,
        batchGatewayAbi,
      } = await loadFixture(fixture)

      const onchainCall = encodeFunctionData({
        abi: universalResolver.abi,
        functionName: 'resolve',
        args: [dnsEncodeName('offchain.test.eth'), '0x12345678'],
      })
      const textData = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'text',
        args: [namehash('offchain.test.eth'), 'foo'],
      })

      const extraData = encodeExtraData({
        isWildcard: false,
        resolver: offchainResolver.address,
        gateways: ['http://universal-offchain-resolver.local'],
        metadata: '0x',
        extraDatas: [
          {
            callbackFunction: '0x00000000',
            data: onchainCall,
          },
          {
            callbackFunction: toFunctionSelector(
              'function resolveCallback(bytes,bytes)',
            ),
            data: textData,
          },
        ],
      })
      const response = encodeFunctionResult({
        abi: batchGatewayAbi,
        functionName: 'query',
        result: [[false], [textData]],
      })

      const [[encodedResult, encodedResultTwo], resolverAddress] =
        await universalResolver.read.resolveCallback([response, extraData])

      expect(resolverAddress).toEqualAddress(offchainResolver.address)
      expect(encodedResult.success).toBe(true)
      expect(encodedResultTwo.success).toBe(true)

      const decodedResult = decodeFunctionResult({
        abi: publicResolver.abi,
        functionName: 'text',
        data: encodedResult.returnData,
        args: [namehash('offchain.test.eth'), 'foo'],
      })

      const decodedResultTwo = decodeFunctionResult<
        (typeof publicResolver)['abi'],
        'addr',
        [Hex]
      >({
        abi: publicResolver.abi,
        functionName: 'addr',
        data: encodedResultTwo.returnData,
        args: [namehash('offchain.test.eth')],
      })

      expect(decodedResult).toEqual('foo')
      expect(decodedResultTwo).toEqualAddress(offchainResolver.address)
    })

    it('should handle a non-existent function on an offchain resolver', async () => {
      const {
        universalResolver,
        offchainResolver,
        publicResolver,
        batchGatewayAbi,
      } = await loadFixture(fixture)

      const addrData = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'addr',
        args: [namehash('offchain.test.eth'), 60n],
      })
      const textData = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'text',
        args: [namehash('offchain.test.eth'), 'foo'],
      })
      const extraData = encodeExtraData({
        isWildcard: false,
        resolver: offchainResolver.address,
        gateways: ['http://universal-offchain-resolver.local'],
        metadata: '0x',
        extraDatas: [
          {
            callbackFunction: '0x00000000',
            data: addrData,
          },
          {
            callbackFunction: toFunctionSelector(
              'function resolveCallback(bytes,bytes)',
            ),
            data: textData,
          },
        ],
      })

      const response = encodeFunctionResult({
        abi: batchGatewayAbi,
        functionName: 'query',
        result: [[false], [textData]],
      })

      const [[addr, text], resolverAddress] =
        await universalResolver.read.resolveCallback([response, extraData])
      expect(text.success).toBe(true)
      expect(resolverAddress).toEqualAddress(offchainResolver.address)

      const addrRetFromText = decodeFunctionResult<
        (typeof publicResolver)['abi'],
        'addr',
        [Hex]
      >({
        abi: publicResolver.abi,
        functionName: 'addr',
        data: text.returnData,
        args: [namehash('offchain.test.eth')],
      })

      expect(addr.success).toBe(false)
      expect(addr.returnData).toEqual('0x')
      expect(addrRetFromText).toEqualAddress(offchainResolver.address)
    })
  })

  describe('reverseCallback', () => {
    it('should revert with metadata for initial forward resolution if required', async () => {
      const { universalResolver, offchainResolver, batchGatewayAbi } =
        await loadFixture(fixture)

      const metadata = encodeAbiParameters(
        [{ type: 'string' }, { type: 'address' }],
        ['offchain.test.eth', offchainResolver.address],
      )
      const addrCall = encodeFunctionData({
        abi: offchainResolver.abi,
        functionName: 'addr',
        args: [namehash('offchain.test.eth')],
      })

      const extraData = encodeExtraData({
        isWildcard: false,
        resolver: offchainResolver.address,
        gateways: ['http://universal-offchain-resolver.local'],
        metadata: '0x',
        extraDatas: [
          {
            callbackFunction: toFunctionSelector(
              'function resolveCallback(bytes,bytes)',
            ),
            data: '0x691f3431',
          },
        ],
      })
      const extraDataForResult = encodeExtraData({
        isWildcard: false,
        resolver: offchainResolver.address,
        gateways: ['http://universal-offchain-resolver.local'],
        metadata,
        extraDatas: [
          {
            callbackFunction: toFunctionSelector(
              'function resolveCallback(bytes,bytes)',
            ),
            data: addrCall,
          },
        ],
      })
      const response = encodeFunctionResult({
        abi: batchGatewayAbi,
        functionName: 'query',
        result: [[false], ['0x691f3431']],
      })

      await expect(universalResolver)
        .read('reverseCallback', [response, extraData])
        .toBeRevertedWithCustomError('OffchainLookup')
        .withArgs(
          getAddress(universalResolver.address),
          ['http://universal-offchain-resolver.local'],
          expect.anyValue,
          toFunctionSelector('function reverseCallback(bytes,bytes)'),
          extraDataForResult,
        )
    })

    it('should resolve address record via a callback from offchain lookup', async () => {
      const { universalResolver, offchainResolver, batchGatewayAbi } =
        await loadFixture(fixture)

      const metadata = encodeAbiParameters(
        [{ type: 'string' }, { type: 'address' }],
        ['offchain.test.eth', offchainResolver.address],
      )
      const extraData = encodeExtraData({
        isWildcard: false,
        resolver: offchainResolver.address,
        gateways: ['http://universal-offchain-resolver.local'],
        metadata,
        extraDatas: [
          {
            callbackFunction: toFunctionSelector(
              'function resolveCallback(bytes,bytes)',
            ),
            data: '0x',
          },
        ],
      })
      const response = encodeFunctionResult({
        abi: batchGatewayAbi,
        functionName: 'query',
        result: [[false], ['0x']],
      })

      const [name, a1, a2, a3] = await universalResolver.read.reverseCallback([
        response,
        extraData,
      ])

      expect(name).toEqual('offchain.test.eth')
      expect(a1).toEqualAddress(offchainResolver.address)
      expect(a2).toEqualAddress(offchainResolver.address)
      expect(a3).toEqualAddress(offchainResolver.address)
    })

    it('should propagate HttpError', async () => {
      const { universalResolver, offchainResolver, batchGatewayAbi } =
        await loadFixture(fixture)

      const publicClient = await hre.viem.getPublicClient()

      const universalResolverWithHttpError = getContract({
        abi: [
          ...universalResolver.abi,
          parseAbiItem('error HttpError((uint16,string)[])'),
        ],
        address: universalResolver.address,
        client: publicClient,
      })

      const errorData = encodeErrorResult({
        abi: universalResolverWithHttpError.abi,
        errorName: 'HttpError',
        args: [[[404, 'Not Found']]],
      })

      const metadata = encodeAbiParameters(
        [{ type: 'string' }, { type: 'address' }],
        ['offchain.test.eth', offchainResolver.address],
      )
      const extraData = encodeExtraData({
        isWildcard: false,
        resolver: offchainResolver.address,
        gateways: ['http://universal-offchain-resolver.local'],
        metadata,
        extraDatas: [
          {
            callbackFunction: toFunctionSelector(
              'function resolveCallback(bytes,bytes)',
            ),
            data: errorData,
          },
        ],
      })
      const response = encodeFunctionResult({
        abi: batchGatewayAbi,
        functionName: 'query',
        result: [[true], [errorData]],
      })

      await expect(universalResolverWithHttpError)
        .read('reverseCallback', [response, extraData])
        .toBeRevertedWithCustomError('HttpError')
        .withArgs([[404, 'Not Found']])
    })
  })

  describe('reverse()', () => {
    it('should resolve a reverse record with name and resolver address', async () => {
      const { universalResolver, accounts, publicResolver } = await loadFixture(
        fixture,
      )

      const [name, resolvedAddress, reverseResolverAddress, resolverAddress] =
        (await universalResolver.read.reverse([
          dnsEncodeName(getReverseNode(accounts[0].address)),
        ])) as ReadContractReturnType<
          (typeof universalResolver)['abi'],
          'reverse',
          [Hex]
        >

      expect(name).toEqual('test.eth')
      expect(resolvedAddress).toEqualAddress(accounts[1].address)
      expect(reverseResolverAddress).toEqualAddress(publicResolver.address)
      expect(resolverAddress).toEqualAddress(publicResolver.address)
    })

    it('should not use all the gas on a internal resolver revert', async () => {
      const { universalResolver, accounts } = await loadFixture(fixture)

      await expect(universalResolver)
        .read('reverse', [dnsEncodeName(getReverseNode(accounts[10].address))])
        .not.toBeReverted()
    })
  })
})
