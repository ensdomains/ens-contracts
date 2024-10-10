import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import hre from 'hardhat'
import {
  decodeFunctionResult,
  encodeAbiParameters,
  encodeErrorResult,
  encodeFunctionData,
  encodeFunctionResult,
  encodePacked,
  getAddress,
  hexToBigInt,
  labelhash,
  namehash,
  parseAbi,
  parseAbiParameters,
  toBytes,
  toFunctionSelector,
  toHex,
  zeroAddress,
  zeroHash,
  type Address,
  type Hex,
  type ReadContractReturnType,
} from 'viem'
import { optimism } from 'viem/chains'
import { encodedRealAnchors } from '../fixtures/anchors.js'
import { dnsEncodeName } from '../fixtures/dnsEncodeName.js'
import {
  getReverseNode,
  getReverseNodeHash,
} from '../fixtures/getReverseNode.js'

const emptyBytes4 = '0x00000000'

const encodeResolveMulticallExtraData = ({
  name,
  calls,
  resolverAddress,
  gateways,
  isSingleInternallyEncodedCall,
}: {
  name: Hex
  calls: Hex[]
  resolverAddress: Address
  gateways: string[]
  isSingleInternallyEncodedCall: boolean
}) =>
  encodeAbiParameters(
    parseAbiParameters('bytes, bytes[], address, string[], bool'),
    [name, calls, resolverAddress, gateways, isSingleInternallyEncodedCall],
  )

const encodeInternalMulticallExtraData = ({
  resolverAddress,
  isSingleInternallyEncodedCall,
  isExtendedResolver,
}: {
  resolverAddress: Address
  isSingleInternallyEncodedCall: boolean
  isExtendedResolver: boolean
}) =>
  encodeAbiParameters(parseAbiParameters('address, bool, bool'), [
    resolverAddress,
    isSingleInternallyEncodedCall,
    isExtendedResolver,
  ])

type SingleCallExtraData = {
  resolverAddress: Address
  internalCallbackFunction: Hex
  externalCallbackFunction: Hex
  calldataRewriteFunction: Hex
  failureCallbackFunction: Hex
  validateResponseFunction: Hex
  internalExtraData: Hex
  externalExtraData: Hex
}

const encodeExtraData = ({
  resolverAddress,
  internalCallbackFunction,
  externalCallbackFunction,
  calldataRewriteFunction,
  failureCallbackFunction,
  validateResponseFunction,
  internalExtraData,
  externalExtraData,
}: SingleCallExtraData) =>
  encodeAbiParameters(
    [
      { name: 'target', type: 'address' },
      { name: 'callbackFunctions', type: 'uint256' },
      { name: 'internalExtraData', type: 'bytes' },
      { name: 'externalExtraData', type: 'bytes' },
    ],
    [
      resolverAddress,
      hexToBigInt(
        encodePacked(
          ['bytes4', 'bytes4', 'bytes4', 'bytes4', 'bytes4'],
          [
            externalCallbackFunction,
            validateResponseFunction,
            failureCallbackFunction,
            calldataRewriteFunction,
            internalCallbackFunction,
          ],
        ),
      ),
      internalExtraData,
      externalExtraData,
    ],
  )

const encodeMulticallExtraData = ({
  calls,
  urls,
}: {
  calls: (
    | { offchain: true; callbackFunction: Hex; data: Hex }
    | { offchain: false; data: Hex }
  )[]
  urls: string[]
}) =>
  encodeAbiParameters(parseAbiParameters('(bool,bytes)[], string[]'), [
    calls.map(
      (params) =>
        [
          params.offchain,
          params.offchain
            ? encodeAbiParameters(parseAbiParameters('bytes4,bytes'), [
                params.callbackFunction,
                params.data,
              ])
            : params.data,
        ] as const,
    ),
    urls,
  ])

const encodeReverseWithGatewaysExtraData = ({
  lookupAddress,
  coinType,
  gateways,
}: {
  lookupAddress: Hex
  coinType: bigint
  gateways: string[]
}) =>
  encodeAbiParameters(parseAbiParameters('bytes,uint256,string[]'), [
    lookupAddress,
    coinType,
    gateways,
  ])

const encodeForwardLookupReverseCallbackExtraData = ({
  lookupAddress,
  coinType,
  gateways,
  resolvedName,
  reverseResolverAddress,
  isAddrCall,
}: {
  lookupAddress: Hex
  coinType: bigint
  gateways: string[]
  resolvedName: string
  reverseResolverAddress: Address
  isAddrCall: boolean
}) =>
  encodeAbiParameters(
    parseAbiParameters('bytes,uint256,string[],string,address,bool'),
    [
      lookupAddress,
      coinType,
      gateways,
      resolvedName,
      reverseResolverAddress,
      isAddrCall,
    ],
  )

const baseResolveMulticallExtraData = {
  internalCallbackFunction: toFunctionSelector(
    'function resolveMulticallResolveCallback(bytes,bytes)',
  ),
  externalCallbackFunction: toFunctionSelector(
    'function resolveCallback(bytes,bytes)',
  ),
  calldataRewriteFunction: emptyBytes4,
  failureCallbackFunction: toFunctionSelector(
    'function resolveMulticallResolveCallback(bytes,bytes)',
  ),
  validateResponseFunction: emptyBytes4,
} as const

const baseInternalMulticallExtraData = {
  internalCallbackFunction: toFunctionSelector(
    'function internalMulticallResolveCallback(bytes,bytes)',
  ),
  externalCallbackFunction: toFunctionSelector(
    'function multicallCallback(bytes,bytes)',
  ),
  calldataRewriteFunction: emptyBytes4,
  failureCallbackFunction: emptyBytes4,
  validateResponseFunction: emptyBytes4,
} as const

const baseInternalCallExtraData = {
  internalCallbackFunction: toFunctionSelector(
    'function _internalCallCallback(bytes,bytes)',
  ),
  calldataRewriteFunction: toFunctionSelector(
    'function _internalCallCalldataRewrite((address,string[],bytes,bytes4,bytes))',
  ),
  failureCallbackFunction: emptyBytes4,
  validateResponseFunction: toFunctionSelector(
    'function _internalCallValidateResponse(bytes)',
  ),
  internalExtraData: '0x',
} as const

const opChainId = optimism.id
const opCoinType = (0x80000000 | opChainId) >>> 0
const opHexCoinType = toHex(toBytes(opCoinType)).slice(2)

const solCoinType = 501
const solHexCoinType = toHex(toBytes(solCoinType)).slice(2)
const solAddressHex =
  '0x18f9d8d877393bbbe8d697a8a2e52879cc7e84f467656d1cce6bab5a8d2637ec'

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
  const addrOffchainResolver = await hre.viem.deployContract(
    'DummyAddrOffchainResolver',
    [],
  )
  const addressOffchainResolver = await hre.viem.deployContract(
    'DummyAddressOffchainResolver',
    [],
  )
  const nameOffchainResolver = await hre.viem.deployContract(
    'DummyNameOffchainResolver',
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
    labelhash('oldprimary'),
    accounts[0].address,
    oldResolver.address,
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
    label: 'addr-offchain',
    resolverAddress: addrOffchainResolver.address,
  })
  await createTestEthSub({
    label: 'address-offchain',
    resolverAddress: addressOffchainResolver.address,
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
    accounts[0].address,
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

  // offchain primary
  await reverseRegistrar.write.claim([accounts[2].address], {
    account: accounts[2],
  })
  await ensRegistry.write.setResolver(
    [getReverseNodeHash(accounts[2].address), offchainResolver.address],
    { account: accounts[2] },
  )
  await createTestEthSub({
    label: 'onchain-from-offchain-primary',
    resolverAddress: publicResolver.address,
  })
  await publicResolver.write.setAddr([
    namehash('onchain-from-offchain-primary.test.eth'),
    accounts[2].address,
  ])
  await createTestEthSub({
    label: 'offchain-from-offchain-primary',
    resolverAddress: offchainResolver.address,
  })

  // name offchain primary
  await reverseRegistrar.write.claim([accounts[3].address], {
    account: accounts[3],
  })
  await ensRegistry.write.setResolver(
    [getReverseNodeHash(accounts[3].address), nameOffchainResolver.address],
    { account: accounts[3] },
  )

  // OP reverse resolver (evm)
  const opReverseLabel = accounts[1].address.slice(2).toLowerCase()
  const opReverseNamespace = `${opHexCoinType}.reverse`
  const opReverseNode = namehash(opReverseNamespace)
  await ensRegistry.write.setSubnodeOwner([
    namehash('reverse'),
    labelhash(opHexCoinType),
    accounts[0].address,
  ])
  await ensRegistry.write.setSubnodeRecord([
    opReverseNode,
    labelhash(opReverseLabel),
    accounts[0].address,
    publicResolver.address,
    0n,
  ])
  await ensRegistry.write.setSubnodeRecord([
    namehash('eth'),
    labelhash('op-user'),
    accounts[0].address,
    publicResolver.address,
    0n,
  ])
  await publicResolver.write.setName([
    namehash(`${opReverseLabel}.${opReverseNamespace}`),
    'op-user.eth',
  ])
  await publicResolver.write.setAddr([
    namehash('op-user.eth'),
    BigInt(opCoinType),
    accounts[1].address,
  ])

  // SOL reverse resolver (non-evm)
  const solReverseLabel = solAddressHex.slice(2).toLowerCase()
  const solReverseNamespace = `${solHexCoinType}.reverse`
  const solReverseNode = namehash(solReverseNamespace)
  await ensRegistry.write.setSubnodeOwner([
    namehash('reverse'),
    labelhash(solHexCoinType),
    accounts[0].address,
  ])
  await ensRegistry.write.setSubnodeRecord([
    solReverseNode,
    labelhash(solReverseLabel),
    accounts[0].address,
    publicResolver.address,
    0n,
  ])
  await ensRegistry.write.setSubnodeRecord([
    namehash('eth'),
    labelhash('sol-user'),
    accounts[0].address,
    publicResolver.address,
    0n,
  ])
  await publicResolver.write.setName([
    namehash(`${solReverseLabel}.${solReverseNamespace}`),
    'sol-user.eth',
  ])
  await publicResolver.write.setAddr([
    namehash('sol-user.eth'),
    BigInt(solCoinType),
    solAddressHex,
  ])

  return {
    ensRegistry,
    nameWrapper,
    reverseRegistrar,
    publicResolver,
    universalResolver,
    offchainResolver,
    addrOffchainResolver,
    nameOffchainResolver,
    addressOffchainResolver,
    oldResolver,
    revertResolver,
    legacyResolver,
    accounts,
    batchGatewayAbi,
    root,
  }
}

describe('UniversalResolver', () => {
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
      expect(decodedAddress).toEqualAddress(accounts[0].address)
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
        .withArgs(dnsEncodeName('no-resolver.test.other'))
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
        .withArgs(dnsEncodeName('non-contract-resolver.test.eth'))
    })

    it('should throw with revert data if resolver reverts', async () => {
      const { universalResolver, publicResolver } = await loadFixture(fixture)

      const data = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'addr',
        args: [namehash('revert-resolver.test.eth')],
      })

      const notSupportedError = encodeErrorResult({
        abi: parseAbi(['error Error(string)']),
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
        .toBeRevertedWithCustomError('ResolverNotFound')
        .withArgs(dnsEncodeName('no-resolver.test.eth'))
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

    it('should revert with a resolveMulticall OffchainLookup when the resolver is an extended resolver and reverts with OffchainLookup', async () => {
      const { universalResolver, publicResolver, offchainResolver } =
        await loadFixture(fixture)

      const callData = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'addr',
        args: [namehash('offchain.test.eth')],
      })

      const multicallCalldata = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'multicall',
        args: [[callData]],
      })

      const singleCallExtraData = encodeExtraData({
        resolverAddress: offchainResolver.address,
        ...baseResolveMulticallExtraData,
        internalExtraData: encodeResolveMulticallExtraData({
          name: dnsEncodeName('offchain.test.eth'),
          calls: [callData],
          resolverAddress: offchainResolver.address,
          gateways: ['http://universal-offchain-resolver.local'],
          isSingleInternallyEncodedCall: true,
        }),
        externalExtraData: multicallCalldata,
      })

      await expect(universalResolver)
        .read('resolve', [dnsEncodeName('offchain.test.eth'), callData])
        .toBeRevertedWithCustomError('OffchainLookup')
        .withArgs(
          getAddress(universalResolver.address),
          ['https://example.com/'],
          multicallCalldata,
          toFunctionSelector('function callback(bytes,bytes)'),
          singleCallExtraData,
        )
    })

    it('should revert with a internalMulticall OffchainLookup when the resolver is not an extended resolver and reverts with OffchainLookup', async () => {
      const {
        universalResolver,
        publicResolver,
        addrOffchainResolver,
        batchGatewayAbi,
      } = await loadFixture(fixture)

      const callData = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'addr',
        args: [namehash('addr-offchain.test.eth')],
      })

      const fnRevertData = encodeFunctionResult({
        abi: publicResolver.abi,
        functionName: 'addr',
        result: addrOffchainResolver.address,
      })

      const fnRevertDataWithRewrite = encodeFunctionData({
        abi: batchGatewayAbi,
        functionName: 'query',
        args: [
          addrOffchainResolver.address,
          ['https://example.com/'],
          fnRevertData,
        ],
      })

      const singleCallExtraData = encodeExtraData({
        resolverAddress: universalResolver.address,
        ...baseInternalMulticallExtraData,
        internalExtraData: encodeInternalMulticallExtraData({
          resolverAddress: addrOffchainResolver.address,
          isSingleInternallyEncodedCall: true,
          isExtendedResolver: false,
        }),
        externalExtraData: encodeMulticallExtraData({
          calls: [
            {
              data: encodeExtraData({
                resolverAddress: addrOffchainResolver.address,
                ...baseInternalCallExtraData,
                externalCallbackFunction: toFunctionSelector(
                  'function addrCallback(bytes,bytes)',
                ),
                externalExtraData: fnRevertData,
              }),
              callbackFunction: toFunctionSelector(
                'function callback(bytes,bytes)',
              ),
              offchain: true,
            },
          ],
          urls: ['http://universal-offchain-resolver.local'],
        }),
      })

      const multicallCalldata = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'multicall',
        args: [[fnRevertDataWithRewrite]],
      })

      await expect(universalResolver)
        .read('resolve', [dnsEncodeName('addr-offchain.test.eth'), callData])
        .toBeRevertedWithCustomError('OffchainLookup')
        .withArgs(
          getAddress(universalResolver.address),
          ['http://universal-offchain-resolver.local'],
          multicallCalldata,
          toFunctionSelector('function callback(bytes,bytes)'),
          singleCallExtraData,
        )
    })

    it('should use custom gateways when specified - resolve multicall', async () => {
      const { universalResolver, publicResolver, offchainResolver } =
        await loadFixture(fixture)

      const callData = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'addr',
        args: [namehash('offchain.test.eth')],
      })

      const multicallCalldata = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'multicall',
        args: [[callData]],
      })

      const singleCallExtraData = encodeExtraData({
        resolverAddress: offchainResolver.address,
        ...baseResolveMulticallExtraData,
        internalExtraData: encodeResolveMulticallExtraData({
          name: dnsEncodeName('offchain.test.eth'),
          calls: [callData],
          resolverAddress: offchainResolver.address,
          gateways: ['http://custom.local'],
          isSingleInternallyEncodedCall: true,
        }),
        externalExtraData: multicallCalldata,
      })

      await expect(universalResolver)
        .read('resolveWithGateways', [
          dnsEncodeName('offchain.test.eth'),
          callData,
          ['http://custom.local'],
        ])
        .toBeRevertedWithCustomError('OffchainLookup')
        .withArgs(
          getAddress(universalResolver.address),
          ['https://example.com/'],
          multicallCalldata,
          toFunctionSelector('function callback(bytes,bytes)'),
          singleCallExtraData,
        )
    })

    it('should use custom gateways when specified - internal multicall', async () => {
      const {
        universalResolver,
        publicResolver,
        addrOffchainResolver,
        batchGatewayAbi,
      } = await loadFixture(fixture)

      const callData = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'addr',
        args: [namehash('addr-offchain.test.eth')],
      })

      const fnRevertData = encodeFunctionResult({
        abi: publicResolver.abi,
        functionName: 'addr',
        result: addrOffchainResolver.address,
      })

      const fnRevertDataWithRewrite = encodeFunctionData({
        abi: batchGatewayAbi,
        functionName: 'query',
        args: [
          addrOffchainResolver.address,
          ['https://example.com/'],
          fnRevertData,
        ],
      })

      const singleCallExtraData = encodeExtraData({
        resolverAddress: universalResolver.address,
        ...baseInternalMulticallExtraData,
        internalExtraData: encodeInternalMulticallExtraData({
          resolverAddress: addrOffchainResolver.address,
          isSingleInternallyEncodedCall: true,
          isExtendedResolver: false,
        }),
        externalExtraData: encodeMulticallExtraData({
          calls: [
            {
              data: encodeExtraData({
                resolverAddress: addrOffchainResolver.address,
                ...baseInternalCallExtraData,
                externalCallbackFunction: toFunctionSelector(
                  'function addrCallback(bytes,bytes)',
                ),
                externalExtraData: fnRevertData,
              }),
              callbackFunction: toFunctionSelector(
                'function callback(bytes,bytes)',
              ),
              offchain: true,
            },
          ],
          urls: ['http://custom.local'],
        }),
      })

      const multicallCalldata = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'multicall',
        args: [[fnRevertDataWithRewrite]],
      })

      await expect(universalResolver)
        .read('resolveWithGateways', [
          dnsEncodeName('addr-offchain.test.eth'),
          callData,
          ['http://custom.local'],
        ])
        .toBeRevertedWithCustomError('OffchainLookup')
        .withArgs(
          getAddress(universalResolver.address),
          ['http://custom.local'],
          multicallCalldata,
          toFunctionSelector('function callback(bytes,bytes)'),
          singleCallExtraData,
        )
    })

    it('should revert OffchainLookup via UniversalResolver + OffchainDNSResolver', async () => {
      const { universalResolver, publicResolver, ensRegistry, root } =
        await loadFixture(fixture)

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
      const multicallCalldata = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'multicall',
        args: [[addrCall]],
      })
      const extraData = encodeExtraData({
        resolverAddress: offchainDnsResolver.address,
        ...baseResolveMulticallExtraData,
        internalExtraData: encodeResolveMulticallExtraData({
          name: dnsEncodeName(name),
          calls: [addrCall],
          resolverAddress: offchainDnsResolver.address,
          gateways: ['http://universal-offchain-resolver.local'],
          isSingleInternallyEncodedCall: true,
        }),
        externalExtraData: encodeAbiParameters(
          parseAbiParameters('bytes, bytes, bytes4'),
          [dnsEncodeName(name), multicallCalldata, '0x00000000'],
        ),
      })

      await expect(universalResolver)
        .read('resolve', [dnsEncodeName(name), addrCall])
        .toBeRevertedWithCustomError('OffchainLookup')
        .withArgs(
          getAddress(universalResolver.address),
          [OFFCHAIN_DNS_GATEWAY],
          innerCalldata,
          toFunctionSelector('function callback(bytes,bytes)'),
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

      const [multicallResult] = await universalResolver.read.resolve([
        dnsEncodeName('test.eth'),
        encodeFunctionData({
          abi: publicResolver.abi,
          functionName: 'multicall',
          args: [[textData, addrData]],
        }),
      ])
      const [textResultEncoded, addrResultEncoded] = decodeFunctionResult({
        abi: publicResolver.abi,
        functionName: 'multicall',
        data: multicallResult,
      })

      const textResult = decodeFunctionResult({
        abi: publicResolver.abi,
        functionName: 'text',
        data: textResultEncoded,
        args: [namehash('test.eth'), 'foo'],
      })
      const addrResult = decodeFunctionResult<
        (typeof publicResolver)['abi'],
        'addr',
        typeof addrArgs
      >({
        abi: publicResolver.abi,
        functionName: 'addr',
        data: addrResultEncoded,
        args: addrArgs,
      })

      expect(textResult).toEqual('bar')
      expect(addrResult).toEqualAddress(accounts[0].address)
    })

    it('should resolve multiple records offchain - resolve multicall', async () => {
      const { universalResolver, publicResolver, offchainResolver } =
        await loadFixture(fixture)

      const addrCalldata = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'addr',
        args: [namehash('offchain.test.eth')],
      })
      const textCalldata = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'text',
        args: [namehash('offchain.test.eth'), 'foo'],
      })

      const multicallCalldata = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'multicall',
        args: [[addrCalldata, textCalldata]],
      })

      const extraData = encodeExtraData({
        resolverAddress: offchainResolver.address,
        ...baseResolveMulticallExtraData,
        internalExtraData: encodeResolveMulticallExtraData({
          name: dnsEncodeName('offchain.test.eth'),
          calls: [addrCalldata, textCalldata],
          resolverAddress: offchainResolver.address,
          gateways: ['http://universal-offchain-resolver.local'],
          isSingleInternallyEncodedCall: false,
        }),
        externalExtraData: multicallCalldata,
      })

      await expect(universalResolver)
        .read('resolve', [
          dnsEncodeName('offchain.test.eth'),
          multicallCalldata,
        ])
        .toBeRevertedWithCustomError('OffchainLookup')
        .withArgs(
          getAddress(universalResolver.address),
          ['https://example.com/'],
          multicallCalldata,
          toFunctionSelector('function callback(bytes,bytes)'),
          extraData,
        )
    })

    it('should resolve multiple records offchain - internal multicall', async () => {
      const {
        universalResolver,
        publicResolver,
        addrOffchainResolver,
        batchGatewayAbi,
      } = await loadFixture(fixture)

      const addrCalldata1 = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'addr',
        args: [namehash('addr-offchain.test.eth')],
      })

      const addrCalldata2 = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'addr',
        args: [namehash('addr-offchain.test.eth')],
      })

      const multicallCalldata = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'multicall',
        args: [[addrCalldata1, addrCalldata2]],
      })

      const fnRevertData = encodeFunctionResult({
        abi: publicResolver.abi,
        functionName: 'addr',
        result: addrOffchainResolver.address,
      })

      const fnRevertDataWithRewrite = encodeFunctionData({
        abi: batchGatewayAbi,
        functionName: 'query',
        args: [
          addrOffchainResolver.address,
          ['https://example.com/'],
          fnRevertData,
        ],
      })

      const extraData = encodeExtraData({
        resolverAddress: universalResolver.address,
        ...baseInternalMulticallExtraData,
        internalExtraData: encodeInternalMulticallExtraData({
          resolverAddress: addrOffchainResolver.address,
          isSingleInternallyEncodedCall: false,
          isExtendedResolver: false,
        }),
        externalExtraData: encodeMulticallExtraData({
          calls: [
            {
              data: encodeExtraData({
                resolverAddress: addrOffchainResolver.address,
                ...baseInternalCallExtraData,
                externalCallbackFunction: toFunctionSelector(
                  'function addrCallback(bytes,bytes)',
                ),
                externalExtraData: fnRevertData,
              }),
              callbackFunction: toFunctionSelector(
                'function callback(bytes,bytes)',
              ),
              offchain: true,
            },
            {
              data: encodeExtraData({
                resolverAddress: addrOffchainResolver.address,
                ...baseInternalCallExtraData,
                externalCallbackFunction: toFunctionSelector(
                  'function addrCallback(bytes,bytes)',
                ),
                externalExtraData: fnRevertData,
              }),
              callbackFunction: toFunctionSelector(
                'function callback(bytes,bytes)',
              ),
              offchain: true,
            },
          ],
          urls: ['http://universal-offchain-resolver.local'],
        }),
      })

      const multicallRevertCalldata = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'multicall',
        args: [[fnRevertDataWithRewrite, fnRevertDataWithRewrite]],
      })

      await expect(universalResolver)
        .read('resolve', [
          dnsEncodeName('addr-offchain.test.eth'),
          multicallCalldata,
        ])
        .toBeRevertedWithCustomError('OffchainLookup')
        .withArgs(
          getAddress(universalResolver.address),
          ['http://universal-offchain-resolver.local'],
          multicallRevertCalldata,
          toFunctionSelector('function callback(bytes,bytes)'),
          extraData,
        )
    })

    it('should handle mixed offchain/onchain in internal multicall', async () => {
      const {
        universalResolver,
        publicResolver,
        addrOffchainResolver,
        batchGatewayAbi,
      } = await loadFixture(fixture)

      const addrCalldata1 = encodeFunctionData({
        abi: addrOffchainResolver.abi,
        functionName: 'addr',
        args: [namehash('addr-offchain.test.eth')],
      })

      const addrCalldataOnchain = encodeFunctionData({
        abi: addrOffchainResolver.abi,
        functionName: 'addrOnchain',
        args: [namehash('addr-offchain.test.eth')],
      })

      const multicallCalldata = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'multicall',
        args: [[addrCalldata1, addrCalldataOnchain]],
      })

      const fnRevertData = encodeFunctionResult({
        abi: publicResolver.abi,
        functionName: 'addr',
        result: addrOffchainResolver.address,
      })

      const fnRevertDataWithRewrite = encodeFunctionData({
        abi: batchGatewayAbi,
        functionName: 'query',
        args: [
          addrOffchainResolver.address,
          ['https://example.com/'],
          fnRevertData,
        ],
      })

      const extraData = encodeExtraData({
        resolverAddress: universalResolver.address,
        ...baseInternalMulticallExtraData,
        internalExtraData: encodeInternalMulticallExtraData({
          resolverAddress: addrOffchainResolver.address,
          isSingleInternallyEncodedCall: false,
          isExtendedResolver: false,
        }),
        externalExtraData: encodeMulticallExtraData({
          calls: [
            {
              data: encodeExtraData({
                resolverAddress: addrOffchainResolver.address,
                ...baseInternalCallExtraData,
                externalCallbackFunction: toFunctionSelector(
                  'function addrCallback(bytes,bytes)',
                ),
                externalExtraData: fnRevertData,
              }),
              callbackFunction: toFunctionSelector(
                'function callback(bytes,bytes)',
              ),
              offchain: true,
            },
            {
              data: fnRevertData,
              offchain: false,
            },
          ],
          urls: ['http://universal-offchain-resolver.local'],
        }),
      })

      const multicallRevertCalldata = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'multicall',
        args: [[fnRevertDataWithRewrite]],
      })

      await expect(universalResolver)
        .read('resolve', [
          dnsEncodeName('addr-offchain.test.eth'),
          multicallCalldata,
        ])
        .toBeRevertedWithCustomError('OffchainLookup')
        .withArgs(
          getAddress(universalResolver.address),
          ['http://universal-offchain-resolver.local'],
          multicallRevertCalldata,
          toFunctionSelector('function callback(bytes,bytes)'),
          extraData,
        )
    })
  })

  describe('resolveMulticallResolveCallback()', () => {
    it('should resolve a single record (single internally encoded call)', async () => {
      const { universalResolver, publicResolver, offchainResolver } =
        await loadFixture(fixture)

      const addrArgs = [namehash('offchain.test.eth')] as [Hex]
      const callData = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'addr',
        args: addrArgs,
      })

      const multicallCalldata = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'multicall',
        args: [[callData]],
      })

      const response = encodeAbiParameters(parseAbiParameters('bytes[]'), [
        [
          encodeFunctionResult({
            abi: publicResolver.abi,
            functionName: 'addr',
            result: offchainResolver.address,
          }),
        ],
      ])

      const singleCallExtraData = encodeExtraData({
        resolverAddress: offchainResolver.address,
        ...baseResolveMulticallExtraData,
        internalExtraData: encodeResolveMulticallExtraData({
          name: dnsEncodeName('offchain.test.eth'),
          calls: [callData],
          resolverAddress: offchainResolver.address,
          gateways: ['http://universal-offchain-resolver.local'],
          isSingleInternallyEncodedCall: true,
        }),
        externalExtraData: multicallCalldata,
      })

      const publicClient = await hre.viem.getPublicClient()
      const [encodedAddrResult, resolverAddress] =
        await publicClient.readContract({
          abi: parseAbi([
            'function callback(bytes, bytes) view returns (bytes,address)',
          ]),
          functionName: 'callback',
          address: universalResolver.address,
          args: [response, singleCallExtraData],
        })

      const decodedAddrResult = decodeFunctionResult<
        (typeof publicResolver)['abi'],
        'addr',
        typeof addrArgs
      >({
        abi: publicResolver.abi,
        functionName: 'addr',
        data: encodedAddrResult,
        args: addrArgs,
      })

      expect(decodedAddrResult).toEqualAddress(offchainResolver.address)
      expect(resolverAddress).toEqualAddress(offchainResolver.address)
    })
    it('should resolve multiple records', async () => {
      const { universalResolver, publicResolver, offchainResolver } =
        await loadFixture(fixture)

      const addrArgs = [namehash('offchain.test.eth')] as [Hex]
      const addrCalldata = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'addr',
        args: addrArgs,
      })
      const textCalldata = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'text',
        args: [namehash('offchain.test.eth'), 'foo'],
      })

      const multicallCalldata = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'multicall',
        args: [[addrCalldata, textCalldata]],
      })

      const response = encodeAbiParameters(parseAbiParameters('bytes[]'), [
        [
          encodeFunctionResult({
            abi: publicResolver.abi,
            functionName: 'addr',
            result: offchainResolver.address,
          }),
          encodeFunctionResult({
            abi: publicResolver.abi,
            functionName: 'text',
            result: 'bar',
          }),
        ],
      ])

      const singleCallExtraData = encodeExtraData({
        resolverAddress: offchainResolver.address,
        ...baseResolveMulticallExtraData,
        internalExtraData: encodeResolveMulticallExtraData({
          name: dnsEncodeName('offchain.test.eth'),
          calls: [addrCalldata, textCalldata],
          resolverAddress: offchainResolver.address,
          gateways: ['http://universal-offchain-resolver.local'],
          isSingleInternallyEncodedCall: false,
        }),
        externalExtraData: multicallCalldata,
      })

      const publicClient = await hre.viem.getPublicClient()
      const [multicallResult, resolverAddress] =
        await publicClient.readContract({
          abi: parseAbi([
            'function callback(bytes, bytes) view returns (bytes,address)',
          ]),
          functionName: 'callback',
          address: universalResolver.address,
          args: [response, singleCallExtraData],
        })
      const [encodedAddrResult, encodedTextResult] = decodeFunctionResult({
        abi: publicResolver.abi,
        functionName: 'multicall',
        data: multicallResult,
      })

      const decodedAddrResult = decodeFunctionResult<
        (typeof publicResolver)['abi'],
        'addr',
        typeof addrArgs
      >({
        abi: publicResolver.abi,
        functionName: 'addr',
        data: encodedAddrResult,
        args: addrArgs,
      })

      const decodedTextResult = decodeFunctionResult({
        abi: publicResolver.abi,
        functionName: 'text',
        data: encodedTextResult,
      })

      expect(decodedAddrResult).toEqualAddress(offchainResolver.address)
      expect(decodedTextResult).toEqual('bar')
      expect(resolverAddress).toEqualAddress(offchainResolver.address)
    })
    it('should handle error response with internal multicall', async () => {
      const {
        universalResolver,
        publicResolver,
        offchainResolver,
        batchGatewayAbi,
      } = await loadFixture(fixture)

      const callData = toFunctionSelector('function revertWithData()')

      const originalMulticallCalldata = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'multicall',
        args: [[callData]],
      })

      const response = encodeAbiParameters(parseAbiParameters('bytes[]'), [
        ['0x'],
      ])

      const resolveMulticallExtraData = encodeExtraData({
        resolverAddress: offchainResolver.address,
        ...baseResolveMulticallExtraData,
        internalExtraData: encodeResolveMulticallExtraData({
          name: dnsEncodeName('offchain.test.eth'),
          calls: [callData],
          resolverAddress: offchainResolver.address,
          gateways: ['http://universal-offchain-resolver.local'],
          isSingleInternallyEncodedCall: true,
        }),
        externalExtraData: originalMulticallCalldata,
      })

      const fnRevertDataWithRewrite = encodeFunctionData({
        abi: batchGatewayAbi,
        functionName: 'query',
        args: [offchainResolver.address, ['https://example.com/'], callData],
      })

      const revertExtraData = encodeExtraData({
        resolverAddress: universalResolver.address,
        ...baseInternalMulticallExtraData,
        internalExtraData: encodeInternalMulticallExtraData({
          resolverAddress: offchainResolver.address,
          isSingleInternallyEncodedCall: true,
          isExtendedResolver: true,
        }),
        externalExtraData: encodeMulticallExtraData({
          calls: [
            {
              data: encodeExtraData({
                resolverAddress: offchainResolver.address,
                ...baseInternalCallExtraData,
                externalCallbackFunction: toFunctionSelector(
                  'function resolveCallback(bytes,bytes)',
                ),
                externalExtraData: callData,
              }),
              callbackFunction: toFunctionSelector(
                'function callback(bytes,bytes)',
              ),
              offchain: true,
            },
          ],
          urls: ['http://universal-offchain-resolver.local'],
        }),
      })

      const multicallCalldata = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'multicall',
        args: [[fnRevertDataWithRewrite]],
      })

      await expect(universalResolver)
        .read('callback', [response, resolveMulticallExtraData])
        .toBeRevertedWithCustomError('OffchainLookup')
        .withArgs(
          getAddress(universalResolver.address),
          ['http://universal-offchain-resolver.local'],
          multicallCalldata,
          toFunctionSelector('function callback(bytes,bytes)'),
          revertExtraData,
        )
    })
    it('should handle empty response with internal multicall', async () => {
      const {
        universalResolver,
        publicResolver,
        offchainResolver,
        batchGatewayAbi,
      } = await loadFixture(fixture)

      const callData = toFunctionSelector('function emptyResponse()')

      const originalMulticallCalldata = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'multicall',
        args: [[callData]],
      })

      const response = encodeAbiParameters(parseAbiParameters('bytes[]'), [
        ['0x'],
      ])

      const resolveMulticallExtraData = encodeExtraData({
        resolverAddress: offchainResolver.address,
        ...baseResolveMulticallExtraData,
        internalExtraData: encodeResolveMulticallExtraData({
          name: dnsEncodeName('offchain.test.eth'),
          calls: [callData],
          resolverAddress: offchainResolver.address,
          gateways: ['http://universal-offchain-resolver.local'],
          isSingleInternallyEncodedCall: true,
        }),
        externalExtraData: originalMulticallCalldata,
      })

      const fnRevertDataWithRewrite = encodeFunctionData({
        abi: batchGatewayAbi,
        functionName: 'query',
        args: [offchainResolver.address, ['https://example.com/'], callData],
      })

      const revertExtraData = encodeExtraData({
        resolverAddress: universalResolver.address,
        ...baseInternalMulticallExtraData,
        internalExtraData: encodeInternalMulticallExtraData({
          resolverAddress: offchainResolver.address,
          isSingleInternallyEncodedCall: true,
          isExtendedResolver: true,
        }),
        externalExtraData: encodeMulticallExtraData({
          calls: [
            {
              data: encodeExtraData({
                resolverAddress: offchainResolver.address,
                ...baseInternalCallExtraData,
                externalCallbackFunction: toFunctionSelector(
                  'function resolveCallback(bytes,bytes)',
                ),
                externalExtraData: callData,
              }),
              callbackFunction: toFunctionSelector(
                'function callback(bytes,bytes)',
              ),
              offchain: true,
            },
          ],
          urls: ['http://universal-offchain-resolver.local'],
        }),
      })

      const multicallCalldata = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'multicall',
        args: [[fnRevertDataWithRewrite]],
      })

      await expect(universalResolver)
        .read('callback', [response, resolveMulticallExtraData])
        .toBeRevertedWithCustomError('OffchainLookup')
        .withArgs(
          getAddress(universalResolver.address),
          ['http://universal-offchain-resolver.local'],
          multicallCalldata,
          toFunctionSelector('function callback(bytes,bytes)'),
          revertExtraData,
        )
    })
    it('should propagate empty response error when single internally encoded call', async () => {
      const { universalResolver, publicResolver, offchainResolver } =
        await loadFixture(fixture)

      const callData = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'addr',
        args: [namehash('offchain.test.eth')],
      })

      const originalMulticallCalldata = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'multicall',
        args: [[callData]],
      })

      const response = encodeAbiParameters(parseAbiParameters('bytes[]'), [
        ['0x'],
      ])

      const resolveMulticallExtraData = encodeExtraData({
        resolverAddress: offchainResolver.address,
        ...baseResolveMulticallExtraData,
        internalExtraData: encodeResolveMulticallExtraData({
          name: dnsEncodeName('offchain.test.eth'),
          calls: [callData],
          resolverAddress: offchainResolver.address,
          gateways: ['http://universal-offchain-resolver.local'],
          isSingleInternallyEncodedCall: true,
        }),
        externalExtraData: originalMulticallCalldata,
      })

      await expect(universalResolver)
        .read('callback', [response, resolveMulticallExtraData])
        .toBeRevertedWithCustomError('ResolverError')
        .withArgs('0x')
    })
  })

  describe('internalMulticallResolveCallback()', () => {
    it('should resolve a single record (single internally encoded call) - standard resolver', async () => {
      const {
        universalResolver,
        publicResolver,
        addrOffchainResolver,
        accounts,
      } = await loadFixture(fixture)

      const fnRevertData = encodeFunctionResult({
        abi: publicResolver.abi,
        functionName: 'addr',
        result: accounts[0].address,
      })

      const singleCallExtraData = encodeExtraData({
        resolverAddress: universalResolver.address,
        ...baseInternalMulticallExtraData,
        internalExtraData: encodeInternalMulticallExtraData({
          resolverAddress: addrOffchainResolver.address,
          isSingleInternallyEncodedCall: true,
          isExtendedResolver: false,
        }),
        externalExtraData: encodeMulticallExtraData({
          calls: [
            {
              data: encodeExtraData({
                resolverAddress: addrOffchainResolver.address,
                ...baseInternalCallExtraData,
                externalCallbackFunction: toFunctionSelector(
                  'function addrCallback(bytes,bytes)',
                ),
                externalExtraData: fnRevertData,
              }),
              callbackFunction: toFunctionSelector(
                'function callback(bytes,bytes)',
              ),
              offchain: true,
            },
          ],
          urls: ['http://universal-offchain-resolver.local'],
        }),
      })

      const multicallServerResponse = encodeFunctionResult({
        abi: publicResolver.abi,
        functionName: 'multicall',
        result: [[fnRevertData]] as unknown as [Hex],
      })

      const publicClient = await hre.viem.getPublicClient()
      const [encodedAddrResult, resolverAddress] =
        await publicClient.readContract({
          abi: parseAbi([
            'function callback(bytes, bytes) view returns (bytes,address)',
          ]),
          functionName: 'callback',
          address: universalResolver.address,
          args: [multicallServerResponse, singleCallExtraData],
        })
      expect(resolverAddress).toEqualAddress(addrOffchainResolver.address)

      const decodedAddrResult = decodeFunctionResult<
        (typeof publicResolver)['abi'],
        'addr',
        [Hex]
      >({
        abi: publicResolver.abi,
        functionName: 'addr',
        data: encodedAddrResult,
        args: [namehash('addr-offchain.test.eth')],
      })
      expect(decodedAddrResult).toEqualAddress(accounts[0].address)
    })
    it('should resolve a single record (single internally encoded call) - extended resolver', async () => {
      const { universalResolver, publicResolver, offchainResolver, accounts } =
        await loadFixture(fixture)

      const fnRevertData = encodeFunctionResult({
        abi: publicResolver.abi,
        functionName: 'addr',
        result: accounts[0].address,
      })

      const singleCallExtraData = encodeExtraData({
        resolverAddress: universalResolver.address,
        ...baseInternalMulticallExtraData,
        internalExtraData: encodeInternalMulticallExtraData({
          resolverAddress: offchainResolver.address,
          isSingleInternallyEncodedCall: true,
          isExtendedResolver: true,
        }),
        externalExtraData: encodeMulticallExtraData({
          calls: [
            {
              data: encodeExtraData({
                resolverAddress: offchainResolver.address,
                ...baseInternalCallExtraData,
                externalCallbackFunction: toFunctionSelector(
                  'function resolveCallback(bytes,bytes)',
                ),
                externalExtraData: fnRevertData,
              }),
              callbackFunction: toFunctionSelector(
                'function callback(bytes,bytes)',
              ),
              offchain: true,
            },
          ],
          urls: ['http://universal-offchain-resolver.local'],
        }),
      })

      const multicallServerResponse = encodeFunctionResult({
        abi: publicResolver.abi,
        functionName: 'multicall',
        result: [[fnRevertData]] as unknown as [Hex],
      })

      const publicClient = await hre.viem.getPublicClient()
      const [encodedAddrResult, resolverAddress] =
        await publicClient.readContract({
          abi: parseAbi([
            'function callback(bytes, bytes) view returns (bytes,address)',
          ]),
          functionName: 'callback',
          address: universalResolver.address,
          args: [multicallServerResponse, singleCallExtraData],
        })
      expect(resolverAddress).toEqualAddress(offchainResolver.address)

      const decodedAddrResult = decodeFunctionResult<
        (typeof publicResolver)['abi'],
        'addr',
        [Hex]
      >({
        abi: publicResolver.abi,
        functionName: 'addr',
        data: encodedAddrResult,
        args: [namehash('offchain.test.eth')],
      })
      expect(decodedAddrResult).toEqualAddress(accounts[0].address)
    })
    it('should resolve multiple records - standard resolver', async () => {
      const {
        universalResolver,
        publicResolver,
        addrOffchainResolver,
        accounts,
      } = await loadFixture(fixture)

      const response1 = encodeFunctionResult({
        abi: publicResolver.abi,
        functionName: 'addr',
        result: accounts[0].address,
      })
      const response2 = encodeFunctionResult({
        abi: publicResolver.abi,
        functionName: 'addr',
        result: accounts[1].address,
      })

      const serverMulticallResponse = encodeAbiParameters(
        parseAbiParameters('bytes[]'),
        [[response1, response2]],
      )

      const singleCallExtraData = encodeExtraData({
        resolverAddress: universalResolver.address,
        ...baseInternalMulticallExtraData,
        internalExtraData: encodeInternalMulticallExtraData({
          resolverAddress: addrOffchainResolver.address,
          isSingleInternallyEncodedCall: false,
          isExtendedResolver: false,
        }),
        externalExtraData: encodeMulticallExtraData({
          calls: [
            {
              data: encodeExtraData({
                resolverAddress: addrOffchainResolver.address,
                ...baseInternalCallExtraData,
                externalCallbackFunction: toFunctionSelector(
                  'function addrCallback(bytes,bytes)',
                ),
                externalExtraData: response1,
              }),
              callbackFunction: toFunctionSelector(
                'function callback(bytes,bytes)',
              ),
              offchain: true,
            },
            {
              data: encodeExtraData({
                resolverAddress: addrOffchainResolver.address,
                ...baseInternalCallExtraData,
                externalCallbackFunction: toFunctionSelector(
                  'function addrCallback(bytes,bytes)',
                ),
                externalExtraData: response2,
              }),
              callbackFunction: toFunctionSelector(
                'function callback(bytes,bytes)',
              ),
              offchain: true,
            },
          ],
          urls: ['http://universal-offchain-resolver.local'],
        }),
      })

      const publicClient = await hre.viem.getPublicClient()
      const [multicallResult, resolverAddress] =
        await publicClient.readContract({
          abi: parseAbi([
            'function callback(bytes, bytes) view returns (bytes,address)',
          ]),
          functionName: 'callback',
          address: universalResolver.address,
          args: [serverMulticallResponse, singleCallExtraData],
        })
      expect(resolverAddress).toEqualAddress(addrOffchainResolver.address)

      const [encodedAddrResult1, encodedAddrResult2] = decodeFunctionResult({
        abi: publicResolver.abi,
        functionName: 'multicall',
        data: multicallResult,
      })
      const decodedAddrResult1 = decodeFunctionResult<
        (typeof publicResolver)['abi'],
        'addr',
        [Hex]
      >({
        abi: publicResolver.abi,
        functionName: 'addr',
        data: encodedAddrResult1,
        args: [namehash('addr-offchain.test.eth')],
      })
      expect(decodedAddrResult1).toEqualAddress(accounts[0].address)
      const decodedAddrResult2 = decodeFunctionResult<
        (typeof publicResolver)['abi'],
        'addr',
        [Hex]
      >({
        abi: publicResolver.abi,
        functionName: 'addr',
        data: encodedAddrResult2,
        args: [namehash('addr-offchain.test.eth')],
      })
      expect(decodedAddrResult2).toEqualAddress(accounts[1].address)
    })
    it('should resolve multiple records - extended resolver', async () => {
      const { universalResolver, publicResolver, offchainResolver, accounts } =
        await loadFixture(fixture)

      const addrArgs = [namehash('offchain.test.eth')] as [Hex]
      const addrCalldata = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'addr',
        args: addrArgs,
      })

      const response = encodeAbiParameters(parseAbiParameters('bytes[]'), [
        [
          encodeFunctionResult({
            abi: publicResolver.abi,
            functionName: 'addr',
            result: accounts[0].address,
          }),
          encodeFunctionResult({
            abi: publicResolver.abi,
            functionName: 'addr',
            result: accounts[1].address,
          }),
        ],
      ])

      const singleCallExtraData = encodeExtraData({
        resolverAddress: universalResolver.address,
        ...baseInternalMulticallExtraData,
        internalExtraData: encodeInternalMulticallExtraData({
          resolverAddress: offchainResolver.address,
          isSingleInternallyEncodedCall: false,
          isExtendedResolver: true,
        }),
        externalExtraData: encodeMulticallExtraData({
          calls: [
            {
              data: encodeExtraData({
                resolverAddress: offchainResolver.address,
                ...baseInternalCallExtraData,
                externalCallbackFunction: toFunctionSelector(
                  'function resolveCallback(bytes,bytes)',
                ),
                externalExtraData: addrCalldata,
              }),
              callbackFunction: toFunctionSelector(
                'function callback(bytes,bytes)',
              ),
              offchain: true,
            },
            {
              data: encodeExtraData({
                resolverAddress: offchainResolver.address,
                ...baseInternalCallExtraData,
                externalCallbackFunction: toFunctionSelector(
                  'function resolveCallback(bytes,bytes)',
                ),
                externalExtraData: addrCalldata,
              }),
              callbackFunction: toFunctionSelector(
                'function callback(bytes,bytes)',
              ),
              offchain: true,
            },
          ],
          urls: ['http://universal-offchain-resolver.local'],
        }),
      })

      const publicClient = await hre.viem.getPublicClient()
      const [multicallResult, resolverAddress] =
        await publicClient.readContract({
          abi: parseAbi([
            'function callback(bytes, bytes) view returns (bytes,address)',
          ]),
          functionName: 'callback',
          address: universalResolver.address,
          args: [response, singleCallExtraData],
        })
      expect(resolverAddress).toEqualAddress(offchainResolver.address)

      const [encodedAddrResult1, encodedAddrResult2] = decodeFunctionResult({
        abi: publicResolver.abi,
        functionName: 'multicall',
        data: multicallResult,
      })

      const decodedAddrResult1 = decodeFunctionResult<
        (typeof publicResolver)['abi'],
        'addr',
        typeof addrArgs
      >({
        abi: publicResolver.abi,
        functionName: 'addr',
        data: encodedAddrResult1,
        args: addrArgs,
      })
      expect(decodedAddrResult1).toEqualAddress(accounts[0].address)
      const decodedAddrResult2 = decodeFunctionResult<
        (typeof publicResolver)['abi'],
        'addr',
        typeof addrArgs
      >({
        abi: publicResolver.abi,
        functionName: 'addr',
        data: encodedAddrResult2,
        args: addrArgs,
      })
      expect(decodedAddrResult2).toEqualAddress(accounts[1].address)
    })
    it('should handle mixed offchain/onchain', async () => {
      const {
        universalResolver,
        publicResolver,
        addrOffchainResolver,
        accounts,
      } = await loadFixture(fixture)

      const addrArgs = [namehash('addr-offchain.test.eth')] as [Hex]
      const addrCalldata1 = encodeFunctionData({
        abi: addrOffchainResolver.abi,
        functionName: 'addr',
        args: addrArgs,
      })

      const addrOffchainResponse = encodeFunctionResult({
        abi: addrOffchainResolver.abi,
        functionName: 'addr',
        result: accounts[0].address,
      })

      const addrOnchainResponse = encodeFunctionResult({
        abi: addrOffchainResolver.abi,
        functionName: 'addrOnchain',
        result: addrOffchainResolver.address,
      })

      const serverMulticallResponse = encodeAbiParameters(
        parseAbiParameters('bytes[]'),
        [[addrOffchainResponse]],
      )

      const extraData = encodeExtraData({
        resolverAddress: universalResolver.address,
        ...baseInternalMulticallExtraData,
        internalExtraData: encodeInternalMulticallExtraData({
          resolverAddress: addrOffchainResolver.address,
          isSingleInternallyEncodedCall: false,
          isExtendedResolver: false,
        }),
        externalExtraData: encodeMulticallExtraData({
          calls: [
            {
              data: encodeExtraData({
                resolverAddress: addrOffchainResolver.address,
                ...baseInternalCallExtraData,
                externalCallbackFunction: toFunctionSelector(
                  'function addrCallback(bytes,bytes)',
                ),
                externalExtraData: addrCalldata1,
              }),
              callbackFunction: toFunctionSelector(
                'function callback(bytes,bytes)',
              ),
              offchain: true,
            },
            {
              data: addrOnchainResponse,
              offchain: false,
            },
          ],
          urls: ['http://universal-offchain-resolver.local'],
        }),
      })

      const publicClient = await hre.viem.getPublicClient()
      const [multicallResult, resolverAddress] =
        await publicClient.readContract({
          abi: parseAbi([
            'function callback(bytes, bytes) view returns (bytes,address)',
          ]),
          functionName: 'callback',
          address: universalResolver.address,
          args: [serverMulticallResponse, extraData],
        })
      expect(resolverAddress).toEqualAddress(addrOffchainResolver.address)

      const [encodedAddrResultOffchain, encodedAddrResultOnchain] =
        decodeFunctionResult({
          abi: publicResolver.abi,
          functionName: 'multicall',
          data: multicallResult,
        })

      const decodedAddrResultOffchain = decodeFunctionResult<
        (typeof publicResolver)['abi'],
        'addr',
        typeof addrArgs
      >({
        abi: publicResolver.abi,
        functionName: 'addr',
        data: encodedAddrResultOffchain,
        args: addrArgs,
      })
      expect(decodedAddrResultOffchain).toEqualAddress(accounts[0].address)
      const decodedAddrResultOnchain = decodeFunctionResult<
        (typeof publicResolver)['abi'],
        'addr',
        typeof addrArgs
      >({
        abi: publicResolver.abi,
        functionName: 'addr',
        data: encodedAddrResultOnchain,
        args: addrArgs,
      })
      expect(decodedAddrResultOnchain).toEqualAddress(
        addrOffchainResolver.address,
      )
    })
    it('should propagate empty response error when single internally encoded call', async () => {
      const { universalResolver, offchainResolver } = await loadFixture(fixture)

      const callData = toFunctionSelector('function emptyResponse()')

      const response = encodeAbiParameters(parseAbiParameters('bytes[]'), [
        ['0x'],
      ])

      const extraData = encodeExtraData({
        resolverAddress: universalResolver.address,
        ...baseInternalMulticallExtraData,
        internalExtraData: encodeInternalMulticallExtraData({
          resolverAddress: offchainResolver.address,
          isSingleInternallyEncodedCall: true,
          isExtendedResolver: true,
        }),
        externalExtraData: encodeMulticallExtraData({
          calls: [
            {
              data: encodeExtraData({
                resolverAddress: offchainResolver.address,
                ...baseInternalCallExtraData,
                externalCallbackFunction: toFunctionSelector(
                  'function resolveCallback(bytes,bytes)',
                ),
                externalExtraData: callData,
              }),
              callbackFunction: toFunctionSelector(
                'function callback(bytes,bytes)',
              ),
              offchain: true,
            },
          ],
          urls: ['http://universal-offchain-resolver.local'],
        }),
      })

      await expect(universalResolver)
        .read('callback', [response, extraData])
        .toBeRevertedWithCustomError('ResolverError')
        .withArgs('0x')
    })
    it('should propagate error response when single internally encoded call', async () => {
      const { universalResolver, offchainResolver } = await loadFixture(fixture)

      const callData = toFunctionSelector('function revertWithData()')

      const response = encodeAbiParameters(parseAbiParameters('bytes[]'), [
        ['0x'],
      ])

      const extraData = encodeExtraData({
        resolverAddress: universalResolver.address,
        ...baseInternalMulticallExtraData,
        internalExtraData: encodeInternalMulticallExtraData({
          resolverAddress: offchainResolver.address,
          isSingleInternallyEncodedCall: true,
          isExtendedResolver: true,
        }),
        externalExtraData: encodeMulticallExtraData({
          calls: [
            {
              data: encodeExtraData({
                resolverAddress: offchainResolver.address,
                ...baseInternalCallExtraData,
                externalCallbackFunction: toFunctionSelector(
                  'function resolveCallback(bytes,bytes)',
                ),
                externalExtraData: callData,
              }),
              callbackFunction: toFunctionSelector(
                'function callback(bytes,bytes)',
              ),
              offchain: true,
            },
          ],
          urls: ['http://universal-offchain-resolver.local'],
        }),
      })

      await expect(universalResolver)
        .read('callback', [response, extraData])
        .toBeRevertedWithCustomError('ResolverError')
        .withArgs(
          encodeErrorResult({
            abi: parseAbi(['error Error(string)']),
            errorName: 'Error',
            args: ['Unsupported call'],
          }),
        )
    })
    it('should propagate HttpError when single internally encoded call', async () => {
      const { universalResolver, publicResolver, offchainResolver } =
        await loadFixture(fixture)

      const callData = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'addr',
        args: [namehash('offchain.test.eth')],
      })

      const httpError = encodeErrorResult({
        abi: parseAbi(['error HttpError(uint16 status, string message)']),
        errorName: 'HttpError',
        args: [404, 'Not Found'],
      })

      const response = encodeAbiParameters(parseAbiParameters('bytes[]'), [
        [httpError],
      ])

      const extraData = encodeExtraData({
        resolverAddress: universalResolver.address,
        ...baseInternalMulticallExtraData,
        internalExtraData: encodeInternalMulticallExtraData({
          resolverAddress: offchainResolver.address,
          isSingleInternallyEncodedCall: true,
          isExtendedResolver: true,
        }),
        externalExtraData: encodeMulticallExtraData({
          calls: [
            {
              data: encodeExtraData({
                resolverAddress: offchainResolver.address,
                ...baseInternalCallExtraData,
                externalCallbackFunction: toFunctionSelector(
                  'function resolveCallback(bytes,bytes)',
                ),
                externalExtraData: callData,
              }),
              callbackFunction: toFunctionSelector(
                'function callback(bytes,bytes)',
              ),
              offchain: true,
            },
          ],
          urls: ['http://universal-offchain-resolver.local'],
        }),
      })

      await expect(universalResolver)
        .read('callback', [response, extraData])
        .toBeRevertedWithCustomError('HttpError')
        .withArgs(404, 'Not Found')
    })
    it('should not revert if there is an error in a call', async () => {
      const { universalResolver, publicResolver, offchainResolver, accounts } =
        await loadFixture(fixture)

      const addrArgs = [namehash('offchain.test.eth')] as [Hex]
      const addrCalldata = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'addr',
        args: addrArgs,
      })

      const httpError = encodeErrorResult({
        abi: parseAbi(['error HttpError(uint16 status, string message)']),
        errorName: 'HttpError',
        args: [404, 'Not Found'],
      })

      const response = encodeAbiParameters(parseAbiParameters('bytes[]'), [
        [
          httpError,
          encodeFunctionResult({
            abi: publicResolver.abi,
            functionName: 'addr',
            result: accounts[1].address,
          }),
        ],
      ])

      const singleCallExtraData = encodeExtraData({
        resolverAddress: universalResolver.address,
        ...baseInternalMulticallExtraData,
        internalExtraData: encodeInternalMulticallExtraData({
          resolverAddress: offchainResolver.address,
          isSingleInternallyEncodedCall: false,
          isExtendedResolver: true,
        }),
        externalExtraData: encodeMulticallExtraData({
          calls: [
            {
              data: encodeExtraData({
                resolverAddress: offchainResolver.address,
                ...baseInternalCallExtraData,
                externalCallbackFunction: toFunctionSelector(
                  'function resolveCallback(bytes,bytes)',
                ),
                externalExtraData: addrCalldata,
              }),
              callbackFunction: toFunctionSelector(
                'function callback(bytes,bytes)',
              ),
              offchain: true,
            },
            {
              data: encodeExtraData({
                resolverAddress: offchainResolver.address,
                ...baseInternalCallExtraData,
                externalCallbackFunction: toFunctionSelector(
                  'function resolveCallback(bytes,bytes)',
                ),
                externalExtraData: addrCalldata,
              }),
              callbackFunction: toFunctionSelector(
                'function callback(bytes,bytes)',
              ),
              offchain: true,
            },
          ],
          urls: ['http://universal-offchain-resolver.local'],
        }),
      })

      const publicClient = await hre.viem.getPublicClient()
      const [multicallResult, resolverAddress] =
        await publicClient.readContract({
          abi: parseAbi([
            'function callback(bytes, bytes) view returns (bytes,address)',
          ]),
          functionName: 'callback',
          address: universalResolver.address,
          args: [response, singleCallExtraData],
        })
      expect(resolverAddress).toEqualAddress(offchainResolver.address)

      const [errorResult, encodedAddrResult] = decodeFunctionResult({
        abi: publicResolver.abi,
        functionName: 'multicall',
        data: multicallResult,
      })

      expect(errorResult).toMatchObject(httpError)
      const decodedAddrResult = decodeFunctionResult<
        (typeof publicResolver)['abi'],
        'addr',
        typeof addrArgs
      >({
        abi: publicResolver.abi,
        functionName: 'addr',
        data: encodedAddrResult,
        args: addrArgs,
      })
      expect(decodedAddrResult).toEqualAddress(accounts[1].address)
    })

    it('should allow first offchain call at non-0 index', async () => {
      const {
        universalResolver,
        publicResolver,
        addrOffchainResolver,
        accounts,
      } = await loadFixture(fixture)

      const addrArgs = [namehash('addr-offchain.test.eth')] as [Hex]
      const addrCalldata1 = encodeFunctionData({
        abi: addrOffchainResolver.abi,
        functionName: 'addr',
        args: addrArgs,
      })

      const addrOffchainResponse = encodeFunctionResult({
        abi: addrOffchainResolver.abi,
        functionName: 'addr',
        result: accounts[0].address,
      })

      const addrOnchainResponse = encodeFunctionResult({
        abi: addrOffchainResolver.abi,
        functionName: 'addrOnchain',
        result: addrOffchainResolver.address,
      })

      const serverMulticallResponse = encodeAbiParameters(
        parseAbiParameters('bytes[]'),
        [[addrOffchainResponse]],
      )

      const extraData = encodeExtraData({
        resolverAddress: universalResolver.address,
        ...baseInternalMulticallExtraData,
        internalExtraData: encodeInternalMulticallExtraData({
          resolverAddress: addrOffchainResolver.address,
          isSingleInternallyEncodedCall: false,
          isExtendedResolver: false,
        }),
        externalExtraData: encodeMulticallExtraData({
          calls: [
            {
              data: addrOnchainResponse,
              offchain: false,
            },
            {
              data: encodeExtraData({
                resolverAddress: addrOffchainResolver.address,
                ...baseInternalCallExtraData,
                externalCallbackFunction: toFunctionSelector(
                  'function addrCallback(bytes,bytes)',
                ),
                externalExtraData: addrCalldata1,
              }),
              callbackFunction: toFunctionSelector(
                'function callback(bytes,bytes)',
              ),
              offchain: true,
            },
          ],
          urls: ['http://universal-offchain-resolver.local'],
        }),
      })

      const publicClient = await hre.viem.getPublicClient()
      const [multicallResult, resolverAddress] =
        await publicClient.readContract({
          abi: parseAbi([
            'function callback(bytes, bytes) view returns (bytes,address)',
          ]),
          functionName: 'callback',
          address: universalResolver.address,
          args: [serverMulticallResponse, extraData],
        })
      expect(resolverAddress).toEqualAddress(addrOffchainResolver.address)

      const [encodedAddrResultOnchain, encodedAddrResultOffchain] =
        decodeFunctionResult({
          abi: publicResolver.abi,
          functionName: 'multicall',
          data: multicallResult,
        })

      const decodedAddrResultOffchain = decodeFunctionResult<
        (typeof publicResolver)['abi'],
        'addr',
        typeof addrArgs
      >({
        abi: publicResolver.abi,
        functionName: 'addr',
        data: encodedAddrResultOffchain,
        args: addrArgs,
      })
      expect(decodedAddrResultOffchain).toEqualAddress(accounts[0].address)
      const decodedAddrResultOnchain = decodeFunctionResult<
        (typeof publicResolver)['abi'],
        'addr',
        typeof addrArgs
      >({
        abi: publicResolver.abi,
        functionName: 'addr',
        data: encodedAddrResultOnchain,
        args: addrArgs,
      })
      expect(decodedAddrResultOnchain).toEqualAddress(
        addrOffchainResolver.address,
      )
    })
  })

  describe('reverse()', () => {
    it('should resolve eth', async () => {
      const { universalResolver, publicResolver, accounts } = await loadFixture(
        fixture,
      )

      const [name, resolver, reverseResolver] =
        await universalResolver.read.reverse([accounts[0].address, 60n])
      expect(name).toEqual('test.eth')
      expect(resolver).toEqualAddress(publicResolver.address)
      expect(reverseResolver).toEqualAddress(publicResolver.address)
    })
    it('should fallback to resolving eth via legacy addr(bytes32) when addr(bytes32,uint256) fails', async () => {
      const { universalResolver, oldResolver, accounts } = await loadFixture(
        fixture,
      )
      const [name, resolver, reverseResolver] =
        await universalResolver.read.reverse([accounts[10].address, 60n])
      expect(name).toEqual('oldprimary.eth')
      expect(resolver).toEqualAddress(oldResolver.address)
      expect(reverseResolver).toEqualAddress(oldResolver.address)
    })
    it('should resolve evm chains', async () => {
      const { universalResolver, publicResolver, accounts } = await loadFixture(
        fixture,
      )

      const [name, resolver, reverseResolver] =
        await universalResolver.read.reverse([
          accounts[1].address,
          BigInt(opCoinType),
        ])
      expect(name).toEqual('op-user.eth')
      expect(resolver).toEqualAddress(publicResolver.address)
      expect(reverseResolver).toEqualAddress(publicResolver.address)
    })
    it('should resolve non-evm chains', async () => {
      const { universalResolver, publicResolver, accounts } = await loadFixture(
        fixture,
      )
      const [name, resolver, reverseResolver] =
        await universalResolver.read.reverse([
          solAddressHex,
          BigInt(solCoinType),
        ])
      expect(name).toEqual('sol-user.eth')
      expect(resolver).toEqualAddress(publicResolver.address)
      expect(reverseResolver).toEqualAddress(publicResolver.address)
    })
    it('should revert with OffchainLookup when reverse node resolver is offchain', async () => {
      const { universalResolver, offchainResolver, publicResolver, accounts } =
        await loadFixture(fixture)

      const callData = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'name',
        args: [getReverseNodeHash(accounts[2].address)],
      })

      const multicallCalldata = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'multicall',
        args: [[callData]],
      })

      const extraData = encodeExtraData({
        resolverAddress: universalResolver.address,
        internalCallbackFunction: toFunctionSelector(
          'function forwardLookupReverseCallback(bytes,bytes)',
        ),
        externalCallbackFunction: toFunctionSelector(
          'function callback(bytes,bytes)',
        ),
        calldataRewriteFunction: emptyBytes4,
        failureCallbackFunction: emptyBytes4,
        validateResponseFunction: emptyBytes4,
        internalExtraData: encodeReverseWithGatewaysExtraData({
          lookupAddress: accounts[2].address,
          coinType: 60n,
          gateways: ['http://universal-offchain-resolver.local'],
        }),
        externalExtraData: encodeExtraData({
          resolverAddress: offchainResolver.address,
          ...baseResolveMulticallExtraData,
          internalExtraData: encodeResolveMulticallExtraData({
            name: dnsEncodeName(getReverseNode(accounts[2].address)),
            calls: [callData],
            resolverAddress: offchainResolver.address,
            gateways: ['http://universal-offchain-resolver.local'],
            isSingleInternallyEncodedCall: true,
          }),
          externalExtraData: multicallCalldata,
        }),
      })

      await expect(universalResolver)
        .read('reverse', [accounts[2].address, 60n])
        .toBeRevertedWithCustomError('OffchainLookup')
        .withArgs(
          getAddress(universalResolver.address),
          ['https://example.com/'],
          multicallCalldata,
          toFunctionSelector('function callback(bytes,bytes)'),
          extraData,
        )
    })
    it('should use custom gateways when specified', async () => {
      const {
        universalResolver,
        nameOffchainResolver,
        batchGatewayAbi,
        publicResolver,
        accounts,
      } = await loadFixture(fixture)

      const fnRevertData = encodeFunctionResult({
        abi: publicResolver.abi,
        functionName: 'name',
        result: 'name-offchain.eth',
      })

      const fnRevertDataWithRewrite = encodeFunctionData({
        abi: batchGatewayAbi,
        functionName: 'query',
        args: [
          nameOffchainResolver.address,
          ['https://example.com/'],
          fnRevertData,
        ],
      })

      const extraData = encodeExtraData({
        resolverAddress: universalResolver.address,
        internalCallbackFunction: toFunctionSelector(
          'function forwardLookupReverseCallback(bytes,bytes)',
        ),
        externalCallbackFunction: toFunctionSelector(
          'function callback(bytes,bytes)',
        ),
        calldataRewriteFunction: emptyBytes4,
        failureCallbackFunction: emptyBytes4,
        validateResponseFunction: emptyBytes4,
        internalExtraData: encodeReverseWithGatewaysExtraData({
          lookupAddress: accounts[3].address,
          coinType: 60n,
          gateways: ['http://custom.local'],
        }),
        externalExtraData: encodeExtraData({
          resolverAddress: universalResolver.address,
          ...baseInternalMulticallExtraData,
          internalExtraData: encodeInternalMulticallExtraData({
            resolverAddress: nameOffchainResolver.address,
            isSingleInternallyEncodedCall: true,
            isExtendedResolver: false,
          }),
          externalExtraData: encodeMulticallExtraData({
            calls: [
              {
                data: encodeExtraData({
                  resolverAddress: nameOffchainResolver.address,
                  ...baseInternalCallExtraData,
                  externalCallbackFunction: toFunctionSelector(
                    'function nameCallback(bytes,bytes)',
                  ),
                  externalExtraData: fnRevertData,
                }),
                callbackFunction: toFunctionSelector(
                  'function callback(bytes,bytes)',
                ),
                offchain: true,
              },
            ],
            urls: ['http://custom.local'],
          }),
        }),
      })

      const multicallCalldata = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'multicall',
        args: [[fnRevertDataWithRewrite]],
      })

      await expect(universalResolver)
        .read('reverseWithGateways', [
          accounts[3].address,
          60n,
          ['http://custom.local'],
        ])
        .toBeRevertedWithCustomError('OffchainLookup')
        .withArgs(
          getAddress(universalResolver.address),
          ['http://custom.local'],
          multicallCalldata,
          toFunctionSelector('function callback(bytes,bytes)'),
          extraData,
        )
    })
    it('should propagate error in resolution', async () => {
      const { universalResolver, accounts } = await loadFixture(fixture)

      await expect(universalResolver)
        .read('reverse', [accounts[9].address, BigInt(1234)])
        .toBeRevertedWithCustomError('ResolverNotFound')
        .withArgs(
          dnsEncodeName(
            `${accounts[9].address.slice(2).toLowerCase()}.${toHex(
              toBytes(1234),
            ).slice(2)}.reverse`,
          ),
        )
    })
  })

  describe('forwardLookupReverseCallback()', () => {
    it('should finish remaining resolution steps based on offchain response', async () => {
      const { universalResolver, publicResolver, offchainResolver, accounts } =
        await loadFixture(fixture)

      const callData = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'name',
        args: [getReverseNodeHash(accounts[2].address)],
      })

      const multicallCalldata = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'multicall',
        args: [[callData]],
      })

      const response = encodeAbiParameters(parseAbiParameters('bytes[]'), [
        [
          encodeFunctionResult({
            abi: publicResolver.abi,
            functionName: 'name',
            result: 'onchain-from-offchain-primary.test.eth',
          }),
        ],
      ])

      const extraData = encodeExtraData({
        resolverAddress: universalResolver.address,
        internalCallbackFunction: toFunctionSelector(
          'function forwardLookupReverseCallback(bytes,bytes)',
        ),
        externalCallbackFunction: toFunctionSelector(
          'function callback(bytes,bytes)',
        ),
        calldataRewriteFunction: emptyBytes4,
        failureCallbackFunction: emptyBytes4,
        validateResponseFunction: emptyBytes4,
        internalExtraData: encodeReverseWithGatewaysExtraData({
          lookupAddress: accounts[2].address,
          coinType: 60n,
          gateways: ['http://universal-offchain-resolver.local'],
        }),
        externalExtraData: encodeExtraData({
          resolverAddress: offchainResolver.address,
          ...baseResolveMulticallExtraData,
          internalExtraData: encodeResolveMulticallExtraData({
            name: dnsEncodeName(getReverseNode(accounts[2].address)),
            calls: [callData],
            resolverAddress: offchainResolver.address,
            gateways: ['http://universal-offchain-resolver.local'],
            isSingleInternallyEncodedCall: true,
          }),
          externalExtraData: multicallCalldata,
        }),
      })

      const publicClient = await hre.viem.getPublicClient()
      const [name, resolver, reverseResolver] = await publicClient.readContract(
        {
          abi: parseAbi([
            'function callback(bytes,bytes) view returns (string,address,address)',
          ]),
          functionName: 'callback',
          address: universalResolver.address,
          args: [response, extraData],
        },
      )

      expect(name).toEqual('onchain-from-offchain-primary.test.eth')
      expect(resolver).toEqualAddress(publicResolver.address)
      expect(reverseResolver).toEqualAddress(offchainResolver.address)
    })
    it('should revert with OffchainLookup when addr resolver is offchain', async () => {
      const { universalResolver, publicResolver, offchainResolver, accounts } =
        await loadFixture(fixture)

      const responseCalldata = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'name',
        args: [getReverseNodeHash(accounts[2].address)],
      })

      const responseMulticallCalldata = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'multicall',
        args: [[responseCalldata]],
      })

      const response = encodeAbiParameters(parseAbiParameters('bytes[]'), [
        [
          encodeFunctionResult({
            abi: publicResolver.abi,
            functionName: 'name',
            result: 'offchain-from-offchain-primary.test.eth',
          }),
        ],
      ])

      const extraData = encodeExtraData({
        resolverAddress: universalResolver.address,
        internalCallbackFunction: toFunctionSelector(
          'function forwardLookupReverseCallback(bytes,bytes)',
        ),
        externalCallbackFunction: toFunctionSelector(
          'function callback(bytes,bytes)',
        ),
        calldataRewriteFunction: emptyBytes4,
        failureCallbackFunction: emptyBytes4,
        validateResponseFunction: emptyBytes4,
        internalExtraData: encodeReverseWithGatewaysExtraData({
          lookupAddress: accounts[2].address,
          coinType: 60n,
          gateways: ['http://universal-offchain-resolver.local'],
        }),
        externalExtraData: encodeExtraData({
          resolverAddress: offchainResolver.address,
          ...baseResolveMulticallExtraData,
          internalExtraData: encodeResolveMulticallExtraData({
            name: dnsEncodeName(getReverseNode(accounts[2].address)),
            calls: [responseCalldata],
            resolverAddress: offchainResolver.address,
            gateways: ['http://universal-offchain-resolver.local'],
            isSingleInternallyEncodedCall: true,
          }),
          externalExtraData: responseMulticallCalldata,
        }),
      })

      const revertingCalldata = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'addr',
        args: [namehash('offchain-from-offchain-primary.test.eth'), 60n],
      })

      const revertingMulticallCalldata = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'multicall',
        args: [[revertingCalldata]],
      })

      const revertingExtraData = encodeExtraData({
        resolverAddress: universalResolver.address,
        internalCallbackFunction: toFunctionSelector(
          'function processLookupReverseCallback(bytes,bytes)',
        ),
        externalCallbackFunction: toFunctionSelector(
          'function callback(bytes,bytes)',
        ),
        calldataRewriteFunction: emptyBytes4,
        failureCallbackFunction: toFunctionSelector(
          'function attemptAddrResolverReverseCallback(bytes,bytes)',
        ),
        validateResponseFunction: emptyBytes4,
        internalExtraData: encodeForwardLookupReverseCallbackExtraData({
          lookupAddress: accounts[2].address,
          coinType: 60n,
          gateways: ['http://universal-offchain-resolver.local'],
          resolvedName: 'offchain-from-offchain-primary.test.eth',
          reverseResolverAddress: offchainResolver.address,
          isAddrCall: false,
        }),
        externalExtraData: encodeExtraData({
          resolverAddress: offchainResolver.address,
          ...baseResolveMulticallExtraData,
          internalExtraData: encodeResolveMulticallExtraData({
            name: dnsEncodeName('offchain-from-offchain-primary.test.eth'),
            calls: [revertingCalldata],
            resolverAddress: offchainResolver.address,
            gateways: ['http://universal-offchain-resolver.local'],
            isSingleInternallyEncodedCall: true,
          }),
          externalExtraData: revertingMulticallCalldata,
        }),
      })

      await expect(universalResolver)
        .read('callback', [response, extraData])
        .toBeRevertedWithCustomError('OffchainLookup')
        .withArgs(
          getAddress(universalResolver.address),
          ['https://example.com/'],
          revertingMulticallCalldata,
          toFunctionSelector('function callback(bytes,bytes)'),
          revertingExtraData,
        )
    })
    it('should use custom gateways when specified', async () => {
      const {
        universalResolver,
        publicResolver,
        offchainResolver,
        addressOffchainResolver,
        batchGatewayAbi,
        accounts,
      } = await loadFixture(fixture)

      const responseCalldata = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'name',
        args: [getReverseNodeHash(accounts[2].address)],
      })

      const responseMulticallCalldata = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'multicall',
        args: [[responseCalldata]],
      })

      const response = encodeAbiParameters(parseAbiParameters('bytes[]'), [
        [
          encodeFunctionResult({
            abi: publicResolver.abi,
            functionName: 'name',
            result: 'address-offchain.test.eth',
          }),
        ],
      ])

      const extraData = encodeExtraData({
        resolverAddress: universalResolver.address,
        internalCallbackFunction: toFunctionSelector(
          'function forwardLookupReverseCallback(bytes,bytes)',
        ),
        externalCallbackFunction: toFunctionSelector(
          'function callback(bytes,bytes)',
        ),
        calldataRewriteFunction: emptyBytes4,
        failureCallbackFunction: emptyBytes4,
        validateResponseFunction: emptyBytes4,
        internalExtraData: encodeReverseWithGatewaysExtraData({
          lookupAddress: accounts[2].address,
          coinType: 60n,
          gateways: ['http://custom.local'],
        }),
        externalExtraData: encodeExtraData({
          resolverAddress: offchainResolver.address,
          ...baseResolveMulticallExtraData,
          internalExtraData: encodeResolveMulticallExtraData({
            name: dnsEncodeName(getReverseNode(accounts[2].address)),
            calls: [responseCalldata],
            resolverAddress: offchainResolver.address,
            gateways: ['http://custom.local'],
            isSingleInternallyEncodedCall: true,
          }),
          externalExtraData: responseMulticallCalldata,
        }),
      })

      const fnRevertData = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'addr',
        args: [namehash('address-offchain.test.eth'), 60n],
      })

      const fnRevertDataWithRewrite = encodeFunctionData({
        abi: batchGatewayAbi,
        functionName: 'query',
        args: [
          addressOffchainResolver.address,
          ['https://example.com/'],
          fnRevertData,
        ],
      })

      const revertingExtraData = encodeExtraData({
        resolverAddress: universalResolver.address,
        internalCallbackFunction: toFunctionSelector(
          'function processLookupReverseCallback(bytes,bytes)',
        ),
        externalCallbackFunction: toFunctionSelector(
          'function callback(bytes,bytes)',
        ),
        calldataRewriteFunction: emptyBytes4,
        failureCallbackFunction: toFunctionSelector(
          'function attemptAddrResolverReverseCallback(bytes,bytes)',
        ),
        validateResponseFunction: emptyBytes4,
        internalExtraData: encodeForwardLookupReverseCallbackExtraData({
          lookupAddress: accounts[2].address,
          coinType: 60n,
          gateways: ['http://custom.local'],
          resolvedName: 'address-offchain.test.eth',
          reverseResolverAddress: offchainResolver.address,
          isAddrCall: false,
        }),
        externalExtraData: encodeExtraData({
          resolverAddress: universalResolver.address,
          ...baseInternalMulticallExtraData,
          internalExtraData: encodeInternalMulticallExtraData({
            resolverAddress: addressOffchainResolver.address,
            isSingleInternallyEncodedCall: true,
            isExtendedResolver: false,
          }),
          externalExtraData: encodeMulticallExtraData({
            calls: [
              {
                data: encodeExtraData({
                  resolverAddress: addressOffchainResolver.address,
                  ...baseInternalCallExtraData,
                  externalCallbackFunction: toFunctionSelector(
                    'function addrCallback(bytes,bytes)',
                  ),
                  externalExtraData: fnRevertData,
                }),
                callbackFunction: toFunctionSelector(
                  'function callback(bytes,bytes)',
                ),
                offchain: true,
              },
            ],
            urls: ['http://custom.local'],
          }),
        }),
      })

      const revertingMulticallCalldata = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'multicall',
        args: [[fnRevertDataWithRewrite]],
      })

      await expect(universalResolver)
        .read('callback', [response, extraData])
        .toBeRevertedWithCustomError('OffchainLookup')
        .withArgs(
          getAddress(universalResolver.address),
          ['http://custom.local'],
          revertingMulticallCalldata,
          toFunctionSelector('function callback(bytes,bytes)'),
          revertingExtraData,
        )
    })
    it('should propagate error in addr resolution', async () => {
      const { universalResolver, publicResolver, offchainResolver, accounts } =
        await loadFixture(fixture)

      const responseCalldata = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'name',
        args: [getReverseNodeHash(accounts[2].address)],
      })

      const responseMulticallCalldata = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'multicall',
        args: [[responseCalldata]],
      })

      const response = encodeAbiParameters(parseAbiParameters('bytes[]'), [
        [
          encodeFunctionResult({
            abi: publicResolver.abi,
            functionName: 'name',
            result: 'nonexistent.test.eth',
          }),
        ],
      ])

      const extraData = encodeExtraData({
        resolverAddress: universalResolver.address,
        internalCallbackFunction: toFunctionSelector(
          'function forwardLookupReverseCallback(bytes,bytes)',
        ),
        externalCallbackFunction: toFunctionSelector(
          'function callback(bytes,bytes)',
        ),
        calldataRewriteFunction: emptyBytes4,
        failureCallbackFunction: emptyBytes4,
        validateResponseFunction: emptyBytes4,
        internalExtraData: encodeReverseWithGatewaysExtraData({
          lookupAddress: accounts[2].address,
          coinType: 60n,
          gateways: ['http://universal-offchain-resolver.local'],
        }),
        externalExtraData: encodeExtraData({
          resolverAddress: offchainResolver.address,
          ...baseResolveMulticallExtraData,
          internalExtraData: encodeResolveMulticallExtraData({
            name: dnsEncodeName(getReverseNode(accounts[2].address)),
            calls: [responseCalldata],
            resolverAddress: offchainResolver.address,
            gateways: ['http://universal-offchain-resolver.local'],
            isSingleInternallyEncodedCall: true,
          }),
          externalExtraData: responseMulticallCalldata,
        }),
      })

      await expect(universalResolver)
        .read('callback', [response, extraData])
        .toBeRevertedWithCustomError('ResolverNotFound')
        .withArgs(dnsEncodeName('nonexistent.test.eth'))
    })
  })

  describe('processLookupReverseCallback()', () => {
    it('should finish resolution based on offchain response', async () => {
      const { universalResolver, publicResolver, offchainResolver, accounts } =
        await loadFixture(fixture)

      const responseCalldata = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'addr',
        args: [namehash('offchain-from-offchain-primary.test.eth'), 60n],
      })

      const responseMulticallCalldata = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'multicall',
        args: [[responseCalldata]],
      })

      const response = encodeAbiParameters(parseAbiParameters('bytes[]'), [
        [
          encodeFunctionResult({
            abi: parseAbi([
              'function addr(bytes32,uint256) view returns (bytes)',
            ]),
            functionName: 'addr',
            result: accounts[2].address,
          }),
        ],
      ])

      const extraData = encodeExtraData({
        resolverAddress: universalResolver.address,
        internalCallbackFunction: toFunctionSelector(
          'function processLookupReverseCallback(bytes,bytes)',
        ),
        externalCallbackFunction: toFunctionSelector(
          'function callback(bytes,bytes)',
        ),
        calldataRewriteFunction: emptyBytes4,
        failureCallbackFunction: toFunctionSelector(
          'function attemptAddrResolverReverseCallback(bytes,bytes)',
        ),
        validateResponseFunction: emptyBytes4,
        internalExtraData: encodeForwardLookupReverseCallbackExtraData({
          lookupAddress: accounts[2].address,
          coinType: 60n,
          gateways: ['http://universal-offchain-resolver.local'],
          resolvedName: 'offchain-from-offchain-primary.test.eth',
          reverseResolverAddress: offchainResolver.address,
          isAddrCall: false,
        }),
        externalExtraData: encodeExtraData({
          resolverAddress: offchainResolver.address,
          ...baseResolveMulticallExtraData,
          internalExtraData: encodeResolveMulticallExtraData({
            name: dnsEncodeName('offchain-from-offchain-primary.test.eth'),
            calls: [responseCalldata],
            resolverAddress: offchainResolver.address,
            gateways: ['http://universal-offchain-resolver.local'],
            isSingleInternallyEncodedCall: true,
          }),
          externalExtraData: responseMulticallCalldata,
        }),
      })

      const publicClient = await hre.viem.getPublicClient()
      const [name, resolver, reverseResolver] = await publicClient.readContract(
        {
          address: universalResolver.address,
          abi: parseAbi([
            'function callback(bytes,bytes) view returns (string,address,address)',
          ]),
          functionName: 'callback',
          args: [response, extraData],
        },
      )

      expect(name).toEqual('offchain-from-offchain-primary.test.eth')
      expect(resolver).toEqualAddress(offchainResolver.address)
      expect(reverseResolver).toEqualAddress(offchainResolver.address)
    })
    it('should revert with mismatching evm chain address', async () => {
      const { universalResolver, publicResolver, offchainResolver, accounts } =
        await loadFixture(fixture)

      const responseCalldata = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'addr',
        args: [namehash('offchain-from-offchain-primary.test.eth'), 60n],
      })

      const responseMulticallCalldata = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'multicall',
        args: [[responseCalldata]],
      })

      const response = encodeAbiParameters(parseAbiParameters('bytes[]'), [
        [
          encodeFunctionResult({
            abi: parseAbi([
              'function addr(bytes32,uint256) view returns (bytes)',
            ]),
            functionName: 'addr',
            result: accounts[3].address,
          }),
        ],
      ])

      const extraData = encodeExtraData({
        resolverAddress: universalResolver.address,
        internalCallbackFunction: toFunctionSelector(
          'function processLookupReverseCallback(bytes,bytes)',
        ),
        externalCallbackFunction: toFunctionSelector(
          'function callback(bytes,bytes)',
        ),
        calldataRewriteFunction: emptyBytes4,
        failureCallbackFunction: toFunctionSelector(
          'function attemptAddrResolverReverseCallback(bytes,bytes)',
        ),
        validateResponseFunction: emptyBytes4,
        internalExtraData: encodeForwardLookupReverseCallbackExtraData({
          lookupAddress: accounts[2].address,
          coinType: 60n,
          gateways: ['http://universal-offchain-resolver.local'],
          resolvedName: 'offchain-from-offchain-primary.test.eth',
          reverseResolverAddress: offchainResolver.address,
          isAddrCall: false,
        }),
        externalExtraData: encodeExtraData({
          resolverAddress: offchainResolver.address,
          ...baseResolveMulticallExtraData,
          internalExtraData: encodeResolveMulticallExtraData({
            name: dnsEncodeName('offchain-from-offchain-primary.test.eth'),
            calls: [responseCalldata],
            resolverAddress: offchainResolver.address,
            gateways: ['http://universal-offchain-resolver.local'],
            isSingleInternallyEncodedCall: true,
          }),
          externalExtraData: responseMulticallCalldata,
        }),
      })

      await expect(universalResolver)
        .read('callback', [response, extraData])
        .toBeRevertedWithCustomError('ReverseAddressMismatch')
        .withArgs(accounts[3].address)
    })
    it('should revert with mismatching non-evm chain address', async () => {
      const { universalResolver, publicResolver, offchainResolver, accounts } =
        await loadFixture(fixture)

      const responseCalldata = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'addr',
        args: [
          namehash('offchain-from-offchain-primary.test.eth'),
          BigInt(solCoinType),
        ],
      })

      const responseMulticallCalldata = encodeFunctionData({
        abi: publicResolver.abi,
        functionName: 'multicall',
        args: [[responseCalldata]],
      })

      const response = encodeAbiParameters(parseAbiParameters('bytes[]'), [
        [
          encodeFunctionResult({
            abi: parseAbi([
              'function addr(bytes32,uint256) view returns (bytes)',
            ]),
            functionName: 'addr',
            result: '0x00deadbeef',
          }),
        ],
      ])

      const extraData = encodeExtraData({
        resolverAddress: universalResolver.address,
        internalCallbackFunction: toFunctionSelector(
          'function processLookupReverseCallback(bytes,bytes)',
        ),
        externalCallbackFunction: toFunctionSelector(
          'function callback(bytes,bytes)',
        ),
        calldataRewriteFunction: emptyBytes4,
        failureCallbackFunction: toFunctionSelector(
          'function attemptAddrResolverReverseCallback(bytes,bytes)',
        ),
        validateResponseFunction: emptyBytes4,
        internalExtraData: encodeForwardLookupReverseCallbackExtraData({
          lookupAddress: solAddressHex,
          coinType: BigInt(solCoinType),
          gateways: ['http://universal-offchain-resolver.local'],
          resolvedName: 'offchain-from-offchain-primary.test.eth',
          reverseResolverAddress: offchainResolver.address,
          isAddrCall: false,
        }),
        externalExtraData: encodeExtraData({
          resolverAddress: offchainResolver.address,
          ...baseResolveMulticallExtraData,
          internalExtraData: encodeResolveMulticallExtraData({
            name: dnsEncodeName('offchain-from-offchain-primary.test.eth'),
            calls: [responseCalldata],
            resolverAddress: offchainResolver.address,
            gateways: ['http://universal-offchain-resolver.local'],
            isSingleInternallyEncodedCall: true,
          }),
          externalExtraData: responseMulticallCalldata,
        }),
      })

      await expect(universalResolver)
        .read('callback', [response, extraData])
        .toBeRevertedWithCustomError('ReverseAddressMismatch')
        .withArgs('0x00deadbeef')
    })
  })
})
