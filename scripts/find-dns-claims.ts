import { createPublicClient, http } from 'viem'
import { mainnet, sepolia } from 'viem/chains'
import { findDNSClaims } from './dns-claims.js'
import { dnsDecodeName } from '../test/fixtures/dnsDecodeName.js'

// TODO: make cli

const claims = await findDNSClaims({
  publicClient: createPublicClient({
    chain: mainnet,
    transport: http(),
  }),
})

const tally: Record<string, number> = {}
for (const claim of claims) {
  const name = dnsDecodeName(claim.name)
  tally[name] = (tally[name] ?? 0) + 1
}
console.table(Object.entries(tally).sort((a, b) => b[1] - a[1]))
