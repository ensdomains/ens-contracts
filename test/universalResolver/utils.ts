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
  'function setAddr(bytes32, address) external',
])

export const PROFILE_ABI = parseAbi([
  'function addr(bytes32, uint256 coinType) external view returns (bytes)',
  'function text(bytes32, string key) external view returns (string)',
  'function contenthash(bytes32) external view returns (bytes)',
  'function name(bytes32) external view returns (string)',

  'function setAddr(bytes32, uint256 coinType, bytes value) external',
  'function setText(bytes32, string key, string value) external',
  'function setContenthash(bytes32, bytes value) external',
  'function setName(bytes32, string name) external',
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

type StringRecord = {
  value: string
  origin?: KnownOrigin
}

type BytesRecord = {
  value: Hex
  origin?: KnownOrigin
}

type AddressRecord = BytesRecord & {
  coinType: bigint
}

type TextRecord = StringRecord & {
  key: string
}

type ErrorRecord = {
  call: Hex
  answer: Hex
}

export type KnownProfile = {
  title?: string
  name: string
  extended?: boolean
  addresses?: AddressRecord[]
  texts?: TextRecord[]
  contenthash?: BytesRecord
  primary?: StringRecord
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
  write: Hex
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
      write: calls[0].write,
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
    write: encodeFunctionData({
      abi: RESOLVE_MULTICALL,
      args: [calls.map((x) => x.write)],
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
    for (const { coinType, value, origin } of p.addresses) {
      if (coinType === COIN_TYPE_ETH) {
        const abi = ADDR_ABI
        v.push({
          desc: `${functionName}()`,
          origin,
          call: encodeFunctionData({
            abi,
            functionName,
            args: [node],
          }),
          write: encodeFunctionData({
            abi,
            functionName: 'setAddr',
            args: [node, value],
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
            expect(actual, this.desc).toStrictEqual(getAddress(value))
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
          write: encodeFunctionData({
            abi,
            functionName: 'setAddr',
            args: [node, coinType, value],
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
        write: encodeFunctionData({
          abi,
          functionName: 'setText',
          args: [node, key, value],
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
  if (p.contenthash) {
    const abi = PROFILE_ABI
    const functionName = 'contenthash'
    const { value, origin } = p.contenthash
    v.push({
      desc: `${functionName}()`,
      origin,
      call: encodeFunctionData({
        abi,
        functionName,
        args: [node],
      }),
      write: encodeFunctionData({
        abi,
        functionName: 'setContenthash',
        args: [node, value],
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
  if (p.primary) {
    const abi = PROFILE_ABI
    const functionName = 'name'
    const { value, origin } = p.primary
    v.push({
      desc: `${functionName}()`,
      origin,
      call: encodeFunctionData({
        abi,
        functionName,
        args: [node],
      }),
      write: encodeFunctionData({
        abi,
        functionName: 'setName',
        args: [node, value],
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
  if (p.errors) {
    for (const { call, answer } of p.errors) {
      v.push({
        desc: `error(${call.slice(0, 10)})`,
        call,
        write: '0x',
        answer,
        expect(data) {
          expect(data, this.desc).toStrictEqual(this.answer)
        },
      })
    }
  }
  return v
}
