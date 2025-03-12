import {
  decodeFunctionResult,
  encodeFunctionData,
  getAddress,
  Hex,
  namehash,
  parseAbi,
} from 'viem'
import { shortCoin } from '../fixtures/ensip19.js'
import { expect } from 'chai'

// export const RESOLVE_ABI = parseAbi([
//   'function resolve(bytes name, bytes data) external view returns (bytes)',
// ])

export const RESOLVE_MULTICALL = parseAbi([
  'function multicall(bytes[] calls) external view returns (bytes[])',
])

export const ADDR_ABI = parseAbi([
  'function addr(bytes32) external view returns (address)',
])

export const PROFILE_ABI = parseAbi([
  'function addr(bytes32, uint256 coinType) external view returns (bytes)',
  'function text(bytes32, string key) external view returns (string)',
  'function contenthash(bytes32) external view returns (bytes)',
])

export function parentOf(name: string) {
  const i = name.indexOf('.')
  return i == -1 ? '' : name.slice(i + 1)
}

// see: contracts/universalResolver/
export const RESPONSE_BITS = {
  ERROR: 1n << 0n,
  OFFCHAIN: 1n << 1n,
  BATCHED: 1n << 2n,
  RESOLVED: 1n << 3n,
} as const

type KnownOrigin = 'on' | 'off' | 'batched'

type KnownAddressRecord = {
  coinType: bigint
  encodedAddress: Hex
  origin: KnownOrigin
}

type KnownTextRecord = {
  key: string
  value: string
  origin: KnownOrigin
}

export type KnownResolution = {
  style: string
  name: string
  wildcard?: boolean
  addresses?: KnownAddressRecord[]
  texts?: KnownTextRecord[]
}

export type KnownReverse = {
  expectError?: boolean
  encodedAddress: Hex
  coinType: bigint
  expectPrimary?: boolean
}

export type ExpectedCall = {
  desc: string
  origin: KnownOrigin
  call: Hex
  expect(data: Hex): void
}

export type BundledCalls = {
  call: Hex
  unbundle: (data: Hex) => readonly Hex[]
}

export function bundleCalls(calls: ExpectedCall[]): BundledCalls {
  if (calls.length == 1) {
    return { call: calls[0].call, unbundle: (x) => [x] }
  }
  return {
    call: encodeFunctionData({
      abi: RESOLVE_MULTICALL,
      functionName: 'multicall',
      args: [calls.map((x) => x.call)],
    }),
    unbundle: (data) =>
      decodeFunctionResult({
        abi: RESOLVE_MULTICALL,
        functionName: 'multicall',
        data,
      }),
  }
}

export function makeCalls(kr: KnownResolution): ExpectedCall[] {
  const calls: ExpectedCall[] = []
  const node = namehash(kr.name)
  if (kr.addresses) {
    const functionName = 'addr'
    for (const { coinType, encodedAddress, origin } of kr.addresses) {
      if (coinType === 60n) {
        const abi = ADDR_ABI
        calls.push({
          desc: `${functionName}()`,
          origin,
          call: encodeFunctionData({
            abi,
            functionName,
            args: [node],
          }),
          expect(data) {
            const answer = decodeFunctionResult({
              abi,
              functionName,
              data,
            })
            expect(answer, this.desc).toStrictEqual(getAddress(encodedAddress))
          },
        })
      } else {
        const abi = PROFILE_ABI
        calls.push({
          desc: `${functionName}(${shortCoin(coinType)})`,
          origin,
          call: encodeFunctionData({
            abi,
            functionName,
            args: [node, coinType],
          }),
          expect(data) {
            const answer = decodeFunctionResult({
              abi,
              functionName,
              data,
            })
            expect(answer, this.desc).toStrictEqual(encodedAddress)
          },
        })
      }
    }
  }
  if (kr.texts) {
    const abi = PROFILE_ABI
    const functionName = 'text'
    for (const { key, value, origin } of kr.texts) {
      calls.push({
        desc: `${functionName}(${key})`,
        origin,
        call: encodeFunctionData({
          abi,
          functionName,
          args: [node, key],
        }),
        expect(data) {
          const answer = decodeFunctionResult({
            abi,
            functionName,
            data,
          })
          expect(answer, this.desc).toStrictEqual(value)
        },
      })
    }
  }
  return calls
}
