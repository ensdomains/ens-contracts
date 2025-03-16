import type { Hex } from 'viem'

// https://github.com/ensdomains/ens-contracts/blob/feature/bet-193-develop-a-standardized-universalresolver-compatible-with-v1/contracts/utils/ENSIP19.sol

export const COIN_TYPE_ETH = 60n
export const EVM_BIT = 1n << 31n

export function chainFromCoinType(coinType: bigint): number {
  if (coinType == COIN_TYPE_ETH) return 1
  return coinType == BigInt.asUintN(32, coinType) && coinType & EVM_BIT
    ? Number(coinType ^ EVM_BIT)
    : 0
}

export function shortCoin(coinType: bigint) {
  const chain = chainFromCoinType(coinType)
  return chain ? `chain:${chain}` : coinType.toString()
}

export function getReverseName(address: Hex, coinType = COIN_TYPE_ETH) {
  let slug
  if (coinType == COIN_TYPE_ETH) {
    slug = 'addr'
  } else if (coinType == EVM_BIT) {
    slug = 'default'
  } else {
    slug = coinType.toString(16)
  }
  return `${address.slice(2).toLowerCase()}.${slug}.reverse`
}
