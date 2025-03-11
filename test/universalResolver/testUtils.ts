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

const RESOLVE_MULTICALL = parseAbi([
  'function multicall(bytes[] calls) external view returns (bytes[] )',
])

const ADDR_ABI = parseAbi([
  'function addr(bytes32) external view returns (address)',
])

const PROFILE_ABI = parseAbi([
  'function addr(bytes32, uint256 coinType) external view returns (bytes)',
  'function text(bytes32, string key) external view returns (string)',
  'function contenthash(bytes32) external view returns (bytes)',
])

export type KnownResolution = {
  style: string
  name: string
  expectVirtual?: boolean
  addresses?: [coinType: bigint, encodedAddress: Hex][]
  texts?: [key: string, value: string][]
  contenthash?: Hex
  expectError?: boolean
  expectBatched?: boolean
  expectUnreachable?: boolean
}

export type KnownReverse = {
  expectError?: boolean
  encodedAddress: Hex
  coinType: bigint
  primary?: string
}

export type ExpectedCall = {
  desc: string
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

export function makeResolutionCalls(kr: KnownResolution): ExpectedCall[] {
  const calls: ExpectedCall[] = []
  const node = namehash(kr.name)
  if (kr.addresses) {
    const functionName = 'addr'
    for (const [coinType, encodedAddress] of kr.addresses) {
      if (coinType === 60n) {
        const abi = ADDR_ABI
        calls.push({
          desc: `addr()`,
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
          desc: `addr(${shortCoin(coinType)})`,
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
    for (const [key, value] of kr.texts) {
      calls.push({
        desc: `text(${key})`,
        call: encodeFunctionData({
          abi: PROFILE_ABI,
          functionName,
          args: [node, key],
        }),
        expect(data) {
          const answer = decodeFunctionResult({
            abi: PROFILE_ABI,
            functionName,
            data,
          })
          expect(answer, this.desc).toStrictEqual(value)
        },
      })
    }
  }
  const { contenthash } = kr
  if (contenthash) {
    const abi = PROFILE_ABI
    const functionName = 'contenthash'
    calls.push({
      desc: `contenthash()`,
      call: encodeFunctionData({
        abi,
        functionName,
        args: [node],
      }),
      expect(data) {
        const answer = decodeFunctionResult({
          abi: PROFILE_ABI,
          functionName,
          data,
        })
        expect(answer, this.desc).toStrictEqual(contenthash)
      },
    })
  }
  return calls
}
