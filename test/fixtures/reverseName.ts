import { Hex } from 'viem'

export const EVM_BIT = 1n << 31n

export function reverseName(address: Hex, coinType: bigint) {
  let slug
  if (coinType == 60n) {
    slug = 'addr'
  } else if (coinType == EVM_BIT) {
    slug = 'default'
  } else {
    slug = coinType.toString(16)
  }
  return `${address.slice(2)}.${slug}.reverse`
}
