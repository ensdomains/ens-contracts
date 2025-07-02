import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import hre from 'hardhat'
import {
  Address,
  encodeAbiParameters,
  encodeFunctionData,
  getAddress,
  labelhash,
  namehash,
  parseAbiParameters,
  toFunctionSelector,
  zeroAddress,
  zeroHash,
  type Hex,
} from 'viem'
import {
  expiration,
  hexEncodeSignedSet,
  inception,
  rootKeys,
  rrsetWithTexts,
} from '../fixtures/dns.js'
import { dnsEncodeName } from '../fixtures/dnsEncodeName.js'
import { dnssecFixture } from '../fixtures/dnssecFixture.js'

const OFFCHAIN_GATEWAY = 'https://localhost:8000/query'

async function fixture() {
  const { accounts, dnssec } = await loadFixture(dnssecFixture)
  const ensRegistry = await hre.viem.deployContract('ENSRegistry', [])
  const root = await hre.viem.deployContract('Root', [ensRegistry.address])

  await ensRegistry.write.setOwner([zeroHash, root.address])

  const suffixes = await hre.viem.deployContract('SimplePublicSuffixList', [])

  await suffixes.write.addPublicSuffixes([
    [dnsEncodeName('test'), dnsEncodeName('co.nz')],
  ])

  const offchainResolver = await hre.viem.deployContract(
    'MockOffchainResolver',
    [],
  )
  const offchainDnsResolver = await hre.viem.deployContract(
    'OffchainDNSResolver',
    [ensRegistry.address, dnssec.address, OFFCHAIN_GATEWAY],
  )
  const ownedResolver = await hre.viem.deployContract('OwnedResolver', [])
  const dummyResolver = await hre.viem.deployContract(
    'DummyNonCCIPAwareResolver',
    [offchainDnsResolver.address],
  )
  const dnsRegistrar = await hre.viem.deployContract('DNSRegistrar', [
    zeroAddress, // Previous registrar
    offchainDnsResolver.address,
    dnssec.address,
    suffixes.address,
    ensRegistry.address,
  ])

  await root.write.setController([dnsRegistrar.address, true])
  await root.write.setController([accounts[0].address, true])

  const publicResolverAbi = await hre.artifacts
    .readArtifact('PublicResolver')
    .then((a) => a.abi)
  const dnsGatewayAbi = await hre.artifacts
    .readArtifact('IDNSGateway')
    .then((a) => a.abi)

  const doDnsResolveCallback = async ({
    name,
    texts,
    calldata,
  }: {
    name: string
    texts: string[]
    calldata: Hex
  }) => {
    const proof = [
      hexEncodeSignedSet(rootKeys({ expiration, inception })),
      hexEncodeSignedSet(rrsetWithTexts({ name, texts })),
    ]
    const response = encodeAbiParameters(
      [
        {
          type: 'tuple[]',
          components: [
            { name: 'rrset', type: 'bytes' },
            { name: 'sig', type: 'bytes' },
          ],
        },
      ],
      [proof],
    )
    const dnsName = dnsEncodeName(name)
    const extraData = encodeAbiParameters(
      [{ type: 'bytes' }, { type: 'bytes' }, { type: 'bytes4' }],
      [dnsName, calldata, '0x00000000'],
    )

    return offchainDnsResolver.read.resolveCallback([response, extraData])
  }

  const doResolveCallback = async ({
    extraData,
    result,
  }: {
    extraData: Hex
    result: Hex
  }) => {
    const validUntil = BigInt(Math.floor(Date.now() / 1000 + 10000))
    const response = encodeAbiParameters(
      [{ type: 'bytes' }, { type: 'uint64' }, { type: 'bytes' }],
      [result, validUntil, '0x'],
    )

    return offchainResolver.read.resolveCallback([response, extraData])
  }

  return {
    dnssec,
    ensRegistry,
    root,
    suffixes,
    offchainResolver,
    offchainDnsResolver,
    ownedResolver,
    dummyResolver,
    dnsRegistrar,
    publicResolverAbi,
    dnsGatewayAbi,
    accounts,
    doDnsResolveCallback,
    doResolveCallback,
  }
}

describe('OffchainDNSResolver', () => {
  it('should respond to resolution requests with a CCIP read request to the DNS gateway', async () => {
    const { publicResolverAbi, dnsGatewayAbi, offchainDnsResolver } =
      await loadFixture(fixture)

    const name = 'test.test'
    const dnsName = dnsEncodeName(name)
    const callData = encodeFunctionData({
      abi: publicResolverAbi,
      functionName: 'addr',
      args: [namehash(name)],
    })
    const extraData = encodeAbiParameters(
      [{ type: 'bytes' }, { type: 'bytes' }, { type: 'bytes4' }],
      [dnsName, callData, '0x00000000'],
    )

    const gatewayCall = encodeFunctionData({
      abi: dnsGatewayAbi,
      functionName: 'resolve',
      args: [dnsName, 16],
    })

    await expect(offchainDnsResolver)
      .read('resolve', [dnsName, callData])
      .toBeRevertedWithCustomError('OffchainLookup')
      .withArgs(
        getAddress(offchainDnsResolver.address),
        [OFFCHAIN_GATEWAY],
        gatewayCall,
        toFunctionSelector('function resolveCallback(bytes,bytes)'),
        extraData,
      )
  })

  it('handles calls to resolveCallback() with valid DNS TXT records containing an address', async () => {
    const { ownedResolver, doDnsResolveCallback, publicResolverAbi } =
      await loadFixture(fixture)

    const name = 'test.test'
    const testAddress = '0xfefeFEFeFEFEFEFEFeFefefefefeFEfEfefefEfe'

    await ownedResolver.write.setAddr([namehash(name), testAddress])

    const calldata = encodeFunctionData({
      abi: publicResolverAbi,
      functionName: 'addr',
      args: [namehash(name)],
    })

    await expect(
      doDnsResolveCallback({
        name,
        texts: [`ENS1 ${ownedResolver.address}`],
        calldata,
      }),
    ).resolves.toEqual(
      encodeAbiParameters([{ type: 'address' }], [testAddress]),
    )
  })

  it('handles calls to resolveCallback() with extra data and a legacy resolver', async () => {
    const { ownedResolver, publicResolverAbi, doDnsResolveCallback } =
      await loadFixture(fixture)

    const name = 'test.test'
    const testAddress = '0xfefeFEFeFEFEFEFEFeFefefefefeFEfEfefefEfe'

    await ownedResolver.write.setAddr([namehash(name), testAddress])

    const calldata = encodeFunctionData({
      abi: publicResolverAbi,
      functionName: 'addr',
      args: [namehash(name)],
    })

    await expect(
      doDnsResolveCallback({
        name,
        texts: [`ENS1 ${ownedResolver.address} blah`],
        calldata,
      }),
    ).resolves.toEqual(
      encodeAbiParameters([{ type: 'address' }], [testAddress]),
    )
  })

  it('handles calls to resolveCallback() with valid DNS TXT records containing a name', async () => {
    const {
      ownedResolver,
      root,
      accounts,
      ensRegistry,
      publicResolverAbi,
      doDnsResolveCallback,
    } = await loadFixture(fixture)

    // Configure dnsresolver.eth to resolve to the ownedResolver so we can use it in the test
    await root.write.setSubnodeOwner([labelhash('eth'), accounts[0].address])
    await ensRegistry.write.setSubnodeRecord([
      namehash('eth'),
      labelhash('dnsresolver'),
      accounts[0].address,
      ownedResolver.address,
      0n,
    ])
    await ownedResolver.write.setAddr([
      namehash('dnsresolver.eth'),
      ownedResolver.address,
    ])

    const name = 'test.etst'
    const testAddress = '0xfefeFEFeFEFEFEFEFeFefefefefeFEfEfefefEfe'

    await ownedResolver.write.setAddr([namehash(name), testAddress])

    const calldata = encodeFunctionData({
      abi: publicResolverAbi,
      functionName: 'addr',
      args: [namehash(name)],
    })

    await expect(
      doDnsResolveCallback({
        name,
        texts: [`ENS1 dnsresolver.eth`],
        calldata,
      }),
    ).resolves.toEqual(
      encodeAbiParameters([{ type: 'address' }], [testAddress]),
    )
  })

  it('rejects calls to resolveCallback() with an invalid TXT record', async () => {
    const {
      ownedResolver,
      doDnsResolveCallback,
      offchainDnsResolver,
      publicResolverAbi,
    } = await loadFixture(fixture)

    const name = 'test.test'
    const testAddress = '0xfefeFEFeFEFEFEFEFeFefefefefeFEfEfefefEfe'

    await ownedResolver.write.setAddr([namehash(name), testAddress])

    const calldata = encodeFunctionData({
      abi: publicResolverAbi,
      functionName: 'addr',
      args: [namehash(name)],
    })

    await expect(offchainDnsResolver)
      .transaction(
        doDnsResolveCallback({
          name,
          texts: ['nonsense'],
          calldata,
        }),
      )
      .toBeRevertedWithCustomError('CouldNotResolve')
  })

  it('handles calls to resolveCallback() where the valid TXT record is not the first', async () => {
    const { ownedResolver, doDnsResolveCallback, publicResolverAbi } =
      await loadFixture(fixture)

    const name = 'test.test'
    const testAddress = '0xfefeFEFeFEFEFEFEFeFefefefefeFEfEfefefEfe'

    await ownedResolver.write.setAddr([namehash(name), testAddress])

    const calldata = encodeFunctionData({
      abi: publicResolverAbi,
      functionName: 'addr',
      args: [namehash(name)],
    })

    await expect(
      doDnsResolveCallback({
        name,
        texts: ['foo', `ENS1 ${ownedResolver.address}`],
        calldata,
      }),
    ).resolves.toEqual(
      encodeAbiParameters([{ type: 'address' }], [testAddress]),
    )
  })

  it('respects the first record with a valid resolver', async () => {
    const { ownedResolver, doDnsResolveCallback, publicResolverAbi } =
      await loadFixture(fixture)

    const name = 'test.test'
    const testAddress = '0xfefeFEFeFEFEFEFEFeFefefefefeFEfEfefefEfe'

    await ownedResolver.write.setAddr([namehash(name), testAddress])

    const calldata = encodeFunctionData({
      abi: publicResolverAbi,
      functionName: 'addr',
      args: [namehash(name)],
    })

    await expect(
      doDnsResolveCallback({
        name,
        texts: [
          'ENS1 nonexistent.eth',
          'ENS1 0x1234',
          `ENS1 ${ownedResolver.address}`,
        ],
        calldata,
      }),
    ).resolves.toEqual(
      encodeAbiParameters([{ type: 'address' }], [testAddress]),
    )
  })

  it('correctly handles extra (string) data in the TXT record when calling a resolver that supports it', async () => {
    const { doDnsResolveCallback, publicResolverAbi } = await loadFixture(
      fixture,
    )

    const resolver = await hre.viem.deployContract(
      'DummyExtendedDNSSECResolver',
      [],
    )
    const name = 'test.test'
    const calldata = encodeFunctionData({
      abi: publicResolverAbi,
      functionName: 'text',
      args: [namehash(name), 'test'],
    })

    await expect(
      doDnsResolveCallback({
        name,
        texts: [`ENS1 ${resolver.address} foobie bletch`],
        calldata,
      }),
    ).resolves.toEqual(
      encodeAbiParameters([{ type: 'string' }], ['foobie bletch']),
    )
  })

  it('correctly handles extra data in the TXT record when calling a resolver that supports address resolution', async () => {
    const { doDnsResolveCallback, publicResolverAbi } = await loadFixture(
      fixture,
    )

    const resolver = await hre.viem.deployContract('ExtendedDNSResolver', [])
    const name = 'test.test'
    const testAddress = '0xfefeFEFeFEFEFEFEFeFefefefefeFEfEfefefEfe'

    const calldata = encodeFunctionData({
      abi: publicResolverAbi,
      functionName: 'addr',
      args: [namehash(name)],
    })

    await expect(
      doDnsResolveCallback({
        name,
        texts: [`ENS1 ${resolver.address} a[60]=${testAddress}`],
        calldata,
      }),
    ).resolves.toEqual(
      encodeAbiParameters([{ type: 'address' }], [testAddress as Address]),
    )
  })

  it('correctly handles extra data in the TXT record when calling a resolver that supports address resolution with valid cointype', async () => {
    const { doDnsResolveCallback, publicResolverAbi } = await loadFixture(
      fixture,
    )

    const resolver = await hre.viem.deployContract('ExtendedDNSResolver', [])
    const name = 'test.test'
    const testAddress = '0xfefeFEFeFEFEFEFEFeFefefefefeFEfEfefefEfe'
    const ethCoinType = 60n
    const calldata = encodeFunctionData({
      abi: publicResolverAbi,
      functionName: 'addr',
      args: [namehash(name), ethCoinType],
    })

    await expect(
      doDnsResolveCallback({
        name,
        texts: [`ENS1 ${resolver.address} a[${ethCoinType}]=${testAddress}`],
        calldata,
      }),
    ).resolves.toEqual(
      encodeAbiParameters([{ type: 'address' }], [testAddress as Address]),
    )
  })

  it('handles extra data in the TXT record when calling a resolver that supports address resolution with invalid cointype', async () => {
    const { doDnsResolveCallback, publicResolverAbi } = await loadFixture(
      fixture,
    )

    const resolver = await hre.viem.deployContract('ExtendedDNSResolver', [])
    const name = 'test.test'
    const testAddress = '0xfefeFEFeFEFEFEFEFeFefefefefeFEfEfefefEfe'
    const btcCoinType = 0n
    const calldata = encodeFunctionData({
      abi: publicResolverAbi,
      functionName: 'addr',
      args: [namehash(name), btcCoinType],
    })

    await expect(
      doDnsResolveCallback({
        name,
        texts: [`ENS1 ${resolver.address} a[60]=${testAddress}`],
        calldata,
      }),
    ).resolves.toEqual('0x')
  })

  it('raises an error if extra (address) data in the TXT record is invalid', async () => {
    const { doDnsResolveCallback, publicResolverAbi } = await loadFixture(
      fixture,
    )

    const resolver = await hre.viem.deployContract('ExtendedDNSResolver', [])
    const name = 'test.test'
    const testAddress = '0xsmth'
    const calldata = encodeFunctionData({
      abi: publicResolverAbi,
      functionName: 'addr',
      args: [namehash(name)],
    })

    await expect(resolver)
      .transaction(
        doDnsResolveCallback({
          name,
          texts: [`ENS1 ${resolver.address} a[60]=${testAddress}`],
          calldata,
        }),
      )
      .toBeRevertedWithCustomError('InvalidAddressFormat')
  })

  it('correctly resolves using legacy resolvers without resolve() support', async () => {
    const { doDnsResolveCallback, publicResolverAbi } = await loadFixture(
      fixture,
    )

    const resolver = await hre.viem.deployContract(
      'DummyLegacyTextResolver',
      [],
    )
    const name = 'test.test'
    const calldata = encodeFunctionData({
      abi: publicResolverAbi,
      functionName: 'text',
      args: [namehash(name), 'test'],
    })

    await expect(
      doDnsResolveCallback({
        name,
        texts: [`ENS1 ${resolver.address} foobie bletch`],
        calldata,
      }),
    ).resolves.toEqual(encodeAbiParameters([{ type: 'string' }], ['test']))
  })

  it('correctly resolves using offchain resolver', async () => {
    const {
      doDnsResolveCallback,
      doResolveCallback,
      offchainResolver,
      offchainDnsResolver,
      publicResolverAbi,
    } = await loadFixture(fixture)

    const name = 'test.test'
    const dnsName = dnsEncodeName(name)
    const calldata = encodeFunctionData({
      abi: publicResolverAbi,
      functionName: 'addr',
      args: [namehash(name)],
    })

    const extraData = encodeAbiParameters(
      parseAbiParameters('bytes,bytes,bytes4'),
      [
        dnsName,
        calldata,
        toFunctionSelector('function resolveCallback(bytes,bytes)'),
      ],
    )

    await expect(offchainDnsResolver)
      .transaction(
        doDnsResolveCallback({
          name,
          texts: [`ENS1 ${offchainResolver.address} foobie bletch`],
          calldata,
        }),
      )
      .toBeRevertedWithCustomError('OffchainLookup')
      .withArgs(
        getAddress(offchainDnsResolver.address),
        ['https://example.com/'],
        calldata,
        toFunctionSelector('function resolveCallback(bytes,bytes)'),
        extraData,
      )

    const expectedAddress = '0x0D59d0f7DcC0fBF0A3305cE0261863aAf7Ab685c'
    const expectedResult = encodeAbiParameters(
      [{ type: 'address' }],
      [expectedAddress],
    )

    await expect(
      doResolveCallback({ result: expectedResult, extraData }),
    ).resolves.toEqual(expectedResult)
  })

  it('should prevent OffchainLookup error propagation from non-CCIP-aware contracts', async () => {
    const {
      offchainDnsResolver,
      doDnsResolveCallback,
      dummyResolver,
      publicResolverAbi,
    } = await loadFixture(fixture)

    const name = 'test.test'
    const calldata = encodeFunctionData({
      abi: publicResolverAbi,
      functionName: 'addr',
      args: [namehash(name)],
    })

    await expect(offchainDnsResolver)
      .transaction(
        doDnsResolveCallback({
          name,
          texts: [`ENS1 ${dummyResolver.address}`],
          calldata,
        }),
      )
      .toBeRevertedWithCustomError('InvalidOperation')
  })
})
