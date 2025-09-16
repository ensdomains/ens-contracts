import {
  type Hex,
  decodeFunctionResult,
  encodeFunctionData,
  encodeFunctionResult,
  getAddress,
  namehash,
  parseAbi,
  toHex,
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
  'function recordVersions(bytes32) external view returns (uint64)',

  'function addr(bytes32, uint256 coinType) external view returns (bytes)',
  'function setAddr(bytes32, uint256 coinType, bytes value) external',

  'function text(bytes32, string key) external view returns (string)',
  'function setText(bytes32, string key, string value) external',

  'function name(bytes32) external view returns (string)',
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

type OriginRecord = { origin?: KnownOrigin }
type StringRecord = OriginRecord & { value: string }
type BytesRecord = OriginRecord & { value: Hex }
type ErrorRecord = OriginRecord & { call: Hex; answer: Hex }
type AddressRecord = BytesRecord & { coinType: bigint }
type TextRecord = StringRecord & { key: string }

export type KnownProfile = {
  title?: string
  name: string
  addresses?: AddressRecord[]
  texts?: TextRecord[]
  primary?: StringRecord
  errors?: ErrorRecord[]
}

export type KnownReverse = {
  title?: string
  address: Hex
  coinType: bigint
  primary?: string;
}

type Expected = {
  call: Hex
  answer: Hex
  expect(data: Hex): void
  write: Hex
}

export type KnownResolution = Expected & {
  desc: string
  origin?: KnownOrigin
}

export type KnownBundle = Expected & {
  resolutions: KnownResolution[]
  unbundle: (data: Hex) => readonly Hex[]
}

export function bundleCalls(resolutions: KnownResolution[]): KnownBundle {
  if (resolutions.length == 1) {
    return {
      ...resolutions[0],
      resolutions,
      unbundle: (x) => [x],
    }
  }
  return {
    call: encodeFunctionData({
      abi: RESOLVE_MULTICALL,
      args: [resolutions.map((x) => x.call)],
    }),
    answer: encodeFunctionResult({
      abi: RESOLVE_MULTICALL,
      functionName: 'multicall',
      result: resolutions.map((x) => {
        let answer = x.answer
        if (typeof answer === 'string') {
          return answer
        } else {
          answer = toHex(answer)
        }
        return answer
      }),
    }),
    resolutions,
    unbundle: (data) =>
      decodeFunctionResult({
        abi: RESOLVE_MULTICALL,
        data,
      }),
    expect(data) {
      const answers = this.unbundle(data)
      expect(answers, 'answers.length').toHaveLength(resolutions.length)
      resolutions.forEach((x, i) => x.expect(answers[i]))
    },
    write: encodeFunctionData({
      abi: RESOLVE_MULTICALL,
      args: [resolutions.map((x) => x.write)],
    }),
  }
}

export function makeResolutions(p: KnownProfile): KnownResolution[] {
  const resolutions: KnownResolution[] = []
  const node = namehash(p.name)
  if (p.addresses) {
    const functionName = 'addr'
    for (const { coinType, value, origin } of p.addresses) {
      if (coinType === COIN_TYPE_ETH) {
        const abi = ADDR_ABI
        resolutions.push({
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
            result: value,
          }),
          expect(data) {
            const actual = decodeFunctionResult({
              abi,
              functionName,
              data,
            })
            expect(actual, this.desc).toStrictEqual(getAddress(value))
          },
          write: encodeFunctionData({
            abi,
            functionName: 'setAddr',
            args: [node, value],
          }),
        })
      } else {
        const abi = PROFILE_ABI
        resolutions.push({
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
            result: value,
          }),
          expect(data) {
            const actual = decodeFunctionResult({
              abi,
              functionName,
              data,
            })
            expect(actual, this.desc).toStrictEqual(value)
          },
          write: encodeFunctionData({
            abi,
            functionName: 'setAddr',
            args: [node, coinType, value],
          }),
        })
      }
    }
  }
  if (p.texts) {
    const abi = PROFILE_ABI
    const functionName = 'text'
    for (const { key, value, origin } of p.texts) {
      resolutions.push({
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
          result: value,
        }),
        expect(data) {
          // Handle empty response case
          if (data === '0x' && value === undefined) {
            return // Empty response is expected
          }
          const actual = decodeFunctionResult({
            abi,
            functionName,
            data,
          })
          expect(actual, this.desc).toStrictEqual(value)
        },
        write: encodeFunctionData({
          abi,
          functionName: 'setText',
          args: [node, key, value],
        }),
      })
    }
  }
  if (p.primary) {
    const abi = PROFILE_ABI
    const functionName = 'name'
    const { value, origin } = p.primary
    resolutions.push({
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
        result: value,
      }),
      expect(data) {
        // Handle empty response case
        if (data === '0x' && value === undefined) {
          return // Empty response is expected
        }
        const actual = decodeFunctionResult({
          abi,
          functionName,
          data,
        })
        // Handle case where empty string is returned but undefined was expected
        if (actual === '' && value === undefined) {
          return // Empty string decoded as undefined
        }
        expect(actual, this.desc).toStrictEqual(value)
      },
      write: encodeFunctionData({
        abi,
        functionName: 'setName',
        args: [node, value],
      }),
    })
  }
  if (p.errors) {
    for (const { call, answer } of p.errors) {
      resolutions.push({
        desc: `error(${call.slice(0, 10)})`,
        call,
        answer,
        expect(data) {
          expect(data, this.desc).toStrictEqual(this.answer)
        },
        write: '0x',
      })
    }
  }
  return resolutions
}
