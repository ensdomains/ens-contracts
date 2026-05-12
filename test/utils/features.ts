import { keccak256, slice, stringToHex } from 'viem'

export function makeFeature(s: string) {
  return slice(keccak256(stringToHex(s)), 0, 4)
}

export const FEATURES = {
  RESOLVER: {
    RESOLVE_MULTICALL: makeFeature('eth.ens.resolver.extended.multicall'),
    SINGULAR: makeFeature('eth.ens.resolver.singular'),
  },
} as const
