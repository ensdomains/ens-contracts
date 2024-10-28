import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import {
  AbiParameter,
  AbiParametersToPrimitiveTypes,
  ExtractAbiFunction,
  ExtractAbiFunctionNames,
} from 'abitype'
import { expect } from 'chai'
import hre from 'hardhat'
import {
  Abi,
  Address,
  bytesToHex,
  encodeAbiParameters,
  encodeFunctionData,
  namehash,
  stringToHex,
} from 'viem'
import { packetToBytes } from '../fixtures/dnsEncodeName.js'

type GetNodeFunctions<
  publicResolverAbi extends Abi,
  functionNames extends ExtractAbiFunctionNames<
    publicResolverAbi,
    'view' | 'pure'
  > = ExtractAbiFunctionNames<publicResolverAbi, 'view' | 'pure'>,
> = {
  [name in functionNames as ExtractAbiFunction<
    publicResolverAbi,
    name
  >['inputs'][0] extends { name: 'node'; type: 'bytes32' }
    ? name
    : never]: ExtractAbiFunction<publicResolverAbi, name>['inputs'] extends [
    any,
    ...infer rest,
  ]
    ? rest extends AbiParameter[]
      ? AbiParametersToPrimitiveTypes<rest>
      : never
    : never
}

async function fixture() {
  const resolver = await hre.viem.deployContract('ExtendedDNSResolver', [])
  const { abi: publicResolverAbi } = await hre.artifacts.readArtifact(
    'PublicResolver',
  )
  type ResolverMethods = GetNodeFunctions<typeof publicResolverAbi>
  type OneOfResolverMethods = {
    [functionName in keyof ResolverMethods]: {
      functionName: functionName
      args: ResolverMethods[functionName]
    }
  }[keyof ResolverMethods]

  async function resolve({
    name,
    context,
    ...encodeParams
  }: { name: string; context: string } & OneOfResolverMethods) {
    const node = namehash(name)
    const callData = encodeFunctionData({
      abi: publicResolverAbi,
      functionName: encodeParams.functionName,
      args: [node, ...encodeParams.args],
    })

    return resolver.read.resolve([
      bytesToHex(packetToBytes(name)),
      callData,
      stringToHex(context),
    ])
  }

  return { resolver, resolve }
}

describe('ExtendedDNSResolver', () => {
  describe('a records', async () => {
    it('resolves Ethereum addresses using addr(bytes32)', async () => {
      const { resolve } = await loadFixture(fixture)

      const name = 'test.test'
      const testAddress = '0xfefeFEFeFEFEFEFEFeFefefefefeFEfEfefefEfe'

      await expect(
        resolve({
          name,
          functionName: 'addr',
          args: [],
          context: `a[60]=${testAddress}`,
        }),
      ).resolves.toEqual(
        encodeAbiParameters([{ type: 'address' }], [testAddress as Address]),
      )
    })

    it('resolves Ethereum addresses using addr(bytes32,uint256)', async () => {
      const { resolve } = await loadFixture(fixture)

      const coinType = 60n
      const name = 'test.test'
      const testAddress = '0xfefeFEFeFEFEFEFEFeFefefefefeFEfEfefefEfe'

      await expect(
        resolve({
          name,
          functionName: 'addr',
          args: [coinType],
          context: `a[60]=${testAddress}`,
        }),
      ).resolves.toEqual(
        encodeAbiParameters([{ type: 'address' }], [testAddress as Address]),
      )
    })

    it('ignores records with the wrong cointype', async () => {
      const { resolve } = await loadFixture(fixture)

      const coinType = 0n
      const name = 'test.test'
      const testAddress = '0xfefeFEFeFEFEFEFEFeFefefefefeFEfEfefefEfe'

      await expect(
        resolve({
          name,
          functionName: 'addr',
          args: [coinType],
          context: `a[60]=${testAddress}`,
        }),
      ).resolves.toEqual('0x')
    })

    it('raises an error for invalid hex data', async () => {
      const { resolver, resolve } = await loadFixture(fixture)

      const name = 'test.test'
      const testAddress = '0xfoobar'

      await expect(resolver)
        .transaction(
          resolve({
            name,
            functionName: 'addr',
            args: [],
            context: `a[60]=${testAddress}`,
          }),
        )
        .toBeRevertedWithCustomError('InvalidAddressFormat')
    })

    it('works if the record comes after an unrelated one', async () => {
      const { resolve } = await loadFixture(fixture)

      const name = 'test.test'
      const testAddress = '0xfefeFEFeFEFEFEFEFeFefefefefeFEfEfefefEfe'

      await expect(
        resolve({
          name,
          functionName: 'addr',
          args: [],
          context: `foo=bar a[60]=${testAddress}`,
        }),
      ).resolves.toEqual(
        encodeAbiParameters([{ type: 'address' }], [testAddress as Address]),
      )
    })

    it('handles multiple spaces between records', async () => {
      const { resolve } = await loadFixture(fixture)

      const name = 'test.test'
      const testAddress = '0xfefeFEFeFEFEFEFEFeFefefefefeFEfEfefefEfe'

      await expect(
        resolve({
          name,
          functionName: 'addr',
          args: [],
          context: `foo=bar  a[60]=${testAddress}`,
        }),
      ).resolves.toEqual(
        encodeAbiParameters([{ type: 'address' }], [testAddress as Address]),
      )
    })

    it('handles multiple spaces between quoted records', async () => {
      const { resolve } = await loadFixture(fixture)

      const name = 'test.test'
      const testAddress = '0xfefeFEFeFEFEFEFEFeFefefefefeFEfEfefefEfe'

      await expect(
        resolve({
          name,
          functionName: 'addr',
          args: [],
          context: `foo='bar'  a[60]=${testAddress}`,
        }),
      ).resolves.toEqual(
        encodeAbiParameters([{ type: 'address' }], [testAddress as Address]),
      )
    })

    it('handles no spaces between quoted records', async () => {
      const { resolve } = await loadFixture(fixture)

      const name = 'test.test'
      const testAddress = '0xfefeFEFeFEFEFEFEFeFefefefefeFEfEfefefEfe'

      await expect(
        resolve({
          name,
          functionName: 'addr',
          args: [],
          context: `foo='bar'a[60]=${testAddress}`,
        }),
      ).resolves.toEqual(
        encodeAbiParameters([{ type: 'address' }], [testAddress as Address]),
      )
    })

    it('works if the record comes after one for another cointype', async () => {
      const { resolve } = await loadFixture(fixture)

      const name = 'test.test'
      const testAddress = '0xfefeFEFeFEFEFEFEFeFefefefefeFEfEfefefEfe'

      await expect(
        resolve({
          name,
          functionName: 'addr',
          args: [],
          context: `a[0]=0x1234 a[60]=${testAddress}`,
        }),
      ).resolves.toEqual(
        encodeAbiParameters([{ type: 'address' }], [testAddress as Address]),
      )
    })

    it('uses the first matching record it finds', async () => {
      const { resolve } = await loadFixture(fixture)

      const name = 'test.test'
      const testAddress = '0xfefeFEFeFEFEFEFEFeFefefefefeFEfEfefefEfe'

      await expect(
        resolve({
          name,
          functionName: 'addr',
          args: [],
          context: `a[60]=${testAddress} a[60]=0x1234567890123456789012345678901234567890`,
        }),
      ).resolves.toEqual(
        encodeAbiParameters([{ type: 'address' }], [testAddress as Address]),
      )
    })

    it('resolves addresses with coin types', async () => {
      const { resolve } = await loadFixture(fixture)

      const optimismChainId = 10
      const optimismCoinType = BigInt((0x80000000 | optimismChainId) >>> 0)
      const name = 'test.test'
      const testAddress = '0xfefeFEFeFEFEFEFEFeFefefefefeFEfEfefefEfe'

      await expect(
        resolve({
          name,
          functionName: 'addr',
          args: [optimismCoinType],
          context: `a[e${optimismChainId}]=${testAddress}`,
        }),
      ).resolves.toEqual(
        encodeAbiParameters([{ type: 'address' }], [testAddress as Address]),
      )
    })
  })

  describe('t records', () => {
    it('decodes an unquoted t record', async () => {
      const { resolve } = await loadFixture(fixture)

      const name = 'test.test'

      await expect(
        resolve({
          name,
          functionName: 'text',
          args: ['com.twitter'],
          context: 't[com.twitter]=nicksdjohnson',
        }),
      ).resolves.toEqual(
        encodeAbiParameters([{ type: 'string' }], ['nicksdjohnson']),
      )
    })

    it('returns 0x for a missing key', async () => {
      const { resolve } = await loadFixture(fixture)

      const name = 'test.test'

      await expect(
        resolve({
          name,
          functionName: 'text',
          args: ['com.discord'],
          context: 't[com.twitter]=nicksdjohnson',
        }),
      ).resolves.toEqual(encodeAbiParameters([{ type: 'string' }], ['']))
    })

    it('decodes a quoted t record', async () => {
      const { resolve } = await loadFixture(fixture)

      const name = 'test.test'

      await expect(
        resolve({
          name,
          functionName: 'text',
          args: ['url'],
          context: "t[url]='https://ens.domains/'",
        }),
      ).resolves.toEqual(
        encodeAbiParameters([{ type: 'string' }], ['https://ens.domains/']),
      )
    })

    it('handles escaped quotes', async () => {
      const { resolve } = await loadFixture(fixture)

      const name = 'test.test'

      await expect(
        resolve({
          name,
          functionName: 'text',
          args: ['note'],
          context: "t[note]='I\\'m great'",
        }),
      ).resolves.toEqual(
        encodeAbiParameters([{ type: 'string' }], ["I'm great"]),
      )
    })

    it('rejects a record with an unterminated quoted string', async () => {
      const { resolve } = await loadFixture(fixture)

      const name = 'test.test'

      await expect(
        resolve({
          name,
          functionName: 'text',
          args: ['note'],
          context: "t[note]='I\\'m great",
        }),
      ).resolves.toEqual(encodeAbiParameters([{ type: 'string' }], ['']))
    })
  })
})
