import { keccak256, slice, stringToHex } from 'viem'

export function makeFeature(s: string) {
  return slice(keccak256(stringToHex(s)), 0, 4)
}

// see: src/common/ResolverFeatures.sol
export const FEATURES = {
  RESOLVER: {
    RESOLVE_MULTICALL: makeFeature('ens.resolver.extended.multicall'),
    SINGULAR: makeFeature('ens.resolver.singular'),
  },
} as const
