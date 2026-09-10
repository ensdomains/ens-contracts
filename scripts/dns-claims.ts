import { mkdir, readFile, writeFile } from 'node:fs/promises'
import {
  type Chain,
  type Address,
  type Transport,
  type Client,
  parseAbi,
  decodeFunctionData,
  type Hex,
  toHex,
} from 'viem'
import { getBlock, getLogs, getTransaction } from 'viem/actions'
import { mainnet, sepolia } from 'viem/chains'

const registrarAbi = parseAbi([
  'event Claim(bytes32 indexed node, address indexed owner, bytes dnsname)',
  'event Claim(bytes32 indexed node, address indexed owner, bytes dnsname, uint32 inception)',
  'function proveAndClaim(bytes name, (bytes,bytes)[] rrsets)',
  'function proveAndClaim(bytes name, (bytes,bytes)[] rrsets, bytes proof)',
  'function proveAndClaimWithResolver(bytes name, (bytes,bytes)[] rrsets, address resolver, address addr)',
  'function proveAndClaimWithResolver(bytes name, (bytes,bytes)[] rrsets, bytes proof, address resolver, address addr)',
])

type Claim = {
  block: Hex
  tx: Hex
  name: Hex
  rrsets: readonly (readonly [Hex, Hex])[]
}

export function dnsRegistrarsForChain(chainId: number): {
  firstClaimBlock: bigint
  chainSlug: string
  registrars: Address[]
} {
  switch (chainId) {
    case mainnet.id:
      return {
        firstClaimBlock: 13083904n,
        chainSlug: 'mainnet',
        registrars: [
          '0xB32cB5677a7C971689228EC835800432B339bA2B', // latest
          '0x58774Bb8acD458A640aF0B88238369A167546ef2', // first
        ],
      }
    case sepolia.id:
      return {
        firstClaimBlock: 5195310n,
        chainSlug: 'sepolia',
        registrars: [
          '0x5a07C75Ae469Bf3ee2657B588e8E6ABAC6741b4f', // latest
          //'0xf13fC748601fDc5afA255e9D9166EB43f603a903', // first (no events)
        ],
      }
    default:
      throw new Error(`unknown chain: ${chainId}`)
  }
}

export async function findDNSClaims({
  publicClient,
  blockStep = 1000n,
}: {
  publicClient: Client<Transport, Chain, undefined>
  blockStep?: bigint
}): Promise<Claim[]> {
  const { firstClaimBlock, chainSlug, registrars } = dnsRegistrarsForChain(
    publicClient.chain.id,
  )

  const chainDir = new URL(`../deployments/${chainSlug}/`, import.meta.url)
  const cacheFile = new URL(`./dns-claims.json`, chainDir)

  await mkdir(chainDir, { recursive: true })

  type ClaimJSON = {
    nextBlock: string
    claims: Claim[]
  }

  let fromBlock = firstClaimBlock
  const claims: Claim[] = []
  const encoding = 'utf8'
  try {
    const { nextBlock, claims: priorClaims } = JSON.parse(
      await readFile(cacheFile, { encoding }),
    ) as ClaimJSON
    fromBlock = BigInt(nextBlock)
    claims.push(...priorClaims)
  } catch {}

  const firstBlock = fromBlock
  const { number: lastBlock } = await getBlock(publicClient, {
    blockTag: 'finalized',
  })

  console.log(`Chain: ${chainSlug}`);
  console.log(`Claims: ${claims.length}`)
  console.log(`Block Range: ${firstBlock}-${lastBlock}`)

  let active = true
  process.once('SIGINT', () => {
    console.log('Stopping...')
    active = false
  })

  while (active && fromBlock < lastBlock) {
    let toBlock = fromBlock + blockStep
    if (toBlock > lastBlock) {
      toBlock = lastBlock
    }
    try {
      const logs = await getLogs(publicClient, {
        address: registrars,
        events: registrarAbi.filter((x) => x.type === 'event'),
        fromBlock,
        toBlock,
      })
      fromBlock = toBlock + 1n
      if (!logs.length) continue
      for (const tx of await Promise.all(
        logs.map((x) =>
          getTransaction(publicClient, { hash: x.transactionHash }),
        ),
      )) {
        try {
          const [name, rrsets] = decodeFunctionData({
            abi: registrarAbi,
            data: tx.input,
          }).args
          claims.push({
            block: toHex(tx.blockNumber),
            tx: tx.hash,
            name,
            rrsets
          })
        } catch {}
      }
      console.log(`Block: ${toBlock} Claims: ${claims.length}`)
    } catch (err) {
      console.error(err)
      break
    }
  }

  if (fromBlock > firstBlock) {
    await writeFile(
      cacheFile,
      JSON.stringify(
        {
          nextBlock: toHex(fromBlock),
          claims,
        } satisfies ClaimJSON,
        null,
        '\t',
      ),
      { encoding },
    )
    console.log(`Updated ${cacheFile}`)
  }

  return claims
}
