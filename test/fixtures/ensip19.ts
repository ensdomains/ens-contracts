import type { Hex } from 'viem'

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
  return chain ? `chain:${chain}` : `coin:${coinType}`
}

export function getReverseName(encodedAddress: Hex, coinType = COIN_TYPE_ETH) {
  return `${encodedAddress.slice(2).toLowerCase()}.${
    coinType == COIN_TYPE_ETH
      ? 'addr'
      : coinType == EVM_BIT
      ? 'default'
      : coinType.toString(16)
  }.reverse`
}
