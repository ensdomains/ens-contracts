import type { Hex } from 'viem'

export const COIN_TYPE_ETH = 60n
export const COIN_TYPE_DEFAULT = 1n << 31n

export function coinTypeFromChain(chain: number) {
  if (chain === 1) return COIN_TYPE_ETH
  if ((chain & Number(COIN_TYPE_DEFAULT - 1n)) !== chain)
    throw new Error(`invalid chain: ${chain}`)
  return BigInt(chain) | COIN_TYPE_DEFAULT
}

export function chainFromCoinType(coinType: bigint): number {
  if (coinType == COIN_TYPE_ETH) return 1
  coinType ^= COIN_TYPE_DEFAULT
  return coinType >= 0 && coinType < COIN_TYPE_DEFAULT ? Number(coinType) : 0
}

export function isEVMCoinType(coinType: bigint) {
  return coinType === COIN_TYPE_DEFAULT || chainFromCoinType(coinType) > 0
}

export function shortCoin(coinType: bigint) {
  return isEVMCoinType(coinType)
    ? `chain:${chainFromCoinType(coinType)}`
    : `coin:${coinType}`
}

export function getReverseNamespace(coinType: bigint) {
  return `${
    coinType == COIN_TYPE_ETH
      ? 'addr'
      : coinType == COIN_TYPE_DEFAULT
      ? 'default'
      : coinType.toString(16)
  }.reverse`
}

export function getReverseName(encodedAddress: Hex, coinType = COIN_TYPE_ETH) {
  const hex = encodedAddress.slice(2)
  if (!hex) throw new Error('empty address')
  return `${hex.toLowerCase()}.${getReverseNamespace(coinType)}`
}
