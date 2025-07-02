import { expect } from 'chai'
import {
  type Hex,
  decodeFunctionResult,
  encodeFunctionData,
  encodeFunctionResult,
  getAddress,
  namehash,
  parseAbi,
} from 'viem'
import { COIN_TYPE_ETH, shortCoin } from '../fixtures/ensip19.js'

export const RESOLVE_MULTICALL = parseAbi([
  'function multicall(bytes[] calls) external view returns (bytes[])',
])

export const ADDR_ABI = parseAbi([
  'function addr(bytes32) external view returns (address)',
])

export const PROFILE_ABI = parseAbi([
  'function addr(bytes32, uint256 coinType) external view returns (bytes)',
  'function text(bytes32, string key) external view returns (string)',
  'function name(bytes32) external view returns (string)',
])

export function getParentName(name: string) {
  const i = name.indexOf('.')
  return i == -1 ? '' : name.slice(i + 1)
}

// see: contracts/ccipRead/CCIPBatcher.sol
export const RESPONSE_FLAGS = {
  OFFCHAIN: 1n << 0n,
  CALL_ERROR: 1n << 1n,
  BATCH_ERROR: 1n << 2n,
  EMPTY_RESPONSE: 1n << 3n,
  EIP140_BEFORE: 1n << 4n,
  EIP140_AFTER: 1n << 5n,
  DONE: 1n << 6n,
} as const

type KnownOrigin = 'on' | 'off' | 'batch'

type AddressRecord = {
  coinType: bigint
  encodedAddress: Hex
  origin?: KnownOrigin
}

type TextRecord = {
  key: string
  value: string
  origin?: KnownOrigin
}

type ErrorRecord = {
  call: Hex
  answer: Hex
}

type PrimaryRecord = {
  name: string
  origin?: KnownOrigin
}

export type KnownProfile = {
  title?: string
  name: string
  extended?: boolean
  addresses?: AddressRecord[]
  texts?: TextRecord[]
  primary?: PrimaryRecord
  errors?: ErrorRecord[]
}

export type KnownReverse = {
  title: string
  expectError?: boolean
  encodedAddress: Hex
  coinType: bigint
  expectPrimary?: boolean
}

type Expected = {
  call: Hex
  answer: Hex
  expect(data: Hex): void
}

export type KnownResolution = Expected & {
  desc: string
  origin?: KnownOrigin
}

export type KnownBundle = Expected & {
  unbundle: (data: Hex) => readonly Hex[]
}

export function bundleCalls(calls: KnownResolution[]): KnownBundle {
  if (calls.length == 1) {
    return {
      call: calls[0].call,
      answer: calls[0].answer,
      unbundle: (x) => [x],
      expect(answer) {
        calls[0].expect(answer)
      },
    }
  }
  return {
    call: encodeFunctionData({
      abi: RESOLVE_MULTICALL,
      args: [calls.map((x) => x.call)],
    }),
    answer: encodeFunctionResult({
      abi: RESOLVE_MULTICALL,
      // TODO: fix when we can use newer viem version
      result: [calls.map((x) => x.answer)] as never,
    }),
    unbundle: (data) =>
      decodeFunctionResult({
        abi: RESOLVE_MULTICALL,
        data,
      }),
    expect(answer) {
      const answers = this.unbundle(answer)
      expect(answers).toHaveLength(calls.length)
      calls.forEach((x, i) => x.expect(answers[i]))
    },
  }
}

export function makeResolutions(p: KnownProfile): KnownResolution[] {
  const v: KnownResolution[] = []
  const node = namehash(p.name)
  if (p.addresses) {
    const functionName = 'addr'
    for (const { coinType, encodedAddress, origin } of p.addresses) {
      if (coinType === COIN_TYPE_ETH) {
        const abi = ADDR_ABI
        v.push({
          desc: `${functionName}()`,
          origin,
          call: encodeFunctionData({
            abi,
            args: [node],
          }),
          answer: encodeFunctionResult({
            abi,
            // TODO: fix when we can use newer viem version
            result: [encodedAddress] as never,
          }),
          expect(data) {
            const actual = decodeFunctionResult({
              abi,
              data,
            })
            expect(actual, this.desc).toStrictEqual(getAddress(encodedAddress))
          },
        })
      } else {
        const abi = PROFILE_ABI
        v.push({
          desc: `${functionName}(${shortCoin(coinType)})`,
          origin,
          call: encodeFunctionData({
            abi,
            functionName,
            args: [node, coinType],
          }),
          answer: encodeFunctionResult({
            abi,
            functionName,
            // TODO: fix when we can use newer viem version
            result: [encodedAddress] as never,
          }),
          expect(data) {
            const actual = decodeFunctionResult({
              abi,
              functionName,
              data,
            })
            expect(actual, this.desc).toStrictEqual(encodedAddress)
          },
        })
      }
    }
  }
  if (p.texts) {
    const abi = PROFILE_ABI
    const functionName = 'text'
    for (const { key, value, origin } of p.texts) {
      v.push({
        desc: `${functionName}(${key})`,
        origin,
        call: encodeFunctionData({
          abi,
          functionName,
          args: [node, key],
        }),
        answer: encodeFunctionResult({
          abi,
          functionName,
          // TODO: fix when we can use newer viem version
          result: [value] as never,
        }),
        expect(data) {
          const actual = decodeFunctionResult({
            abi,
            functionName,
            data,
          })
          expect(actual, this.desc).toStrictEqual(value)
        },
      })
    }
  }
  if (p.primary) {
    const abi = PROFILE_ABI
    const functionName = 'name'
    const { name, origin } = p.primary
    v.push({
      desc: `${functionName}()`,
      origin,
      call: encodeFunctionData({
        abi,
        functionName,
        args: [node],
      }),
      answer: encodeFunctionResult({
        abi,
        functionName,
        // TODO: fix when we can use newer viem version
        result: [name] as never,
      }),
      expect(data) {
        const actual = decodeFunctionResult({
          abi,
          functionName,
          data,
        })
        expect(actual, this.desc).toStrictEqual(name)
      },
    })
  }
  if (p.errors) {
    for (const { call, answer } of p.errors) {
      v.push({
        desc: `error(${call.slice(0, 10)})`,
        call,
        answer,
        expect(data) {
          expect(data, this.desc).toStrictEqual(this.answer)
        },
      })
    }
  }
  return v
}
