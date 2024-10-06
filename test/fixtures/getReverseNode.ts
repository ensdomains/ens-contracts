import { evmChainIdToCoinType } from '@ensdomains/address-encoder/utils'
import { namehash, type Address } from 'viem'

type ReverseNodeOptions =
  | {
      ns?: string | number | bigint | undefined
    }
  | {
      chainId: number | bigint
    }
  | {
      coinType: number | bigint
    }

export const getReverseNamespace = (opts: ReverseNodeOptions) => {
  const base = '.reverse'
  if ('chainId' in opts)
    return `${evmChainIdToCoinType(Number(opts.chainId)).toString(16)}${base}`
  if ('coinType' in opts) return `${opts.coinType.toString(16)}${base}`
  return `${opts.ns ?? 'addr'}${base}`
}

export const getReverseNode = (
  address: Address,
  opts: ReverseNodeOptions = {},
) => `${address.toLowerCase().slice(2)}.${getReverseNamespace(opts)}` as const

export const getReverseNodeHash = (
  address: Address,
  opts: ReverseNodeOptions = {},
) => namehash(getReverseNode(address, opts))
