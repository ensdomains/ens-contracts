import { deployScript } from '@rocketh'
import { Artifact_SimplePublicSuffixList } from "generated/artifacts/SimplePublicSuffixList.js"
import type { Hex } from 'viem'
import { dnsEncodeName } from '../../test/fixtures/dnsEncodeName.js'

export async function fetchPublicSuffixes() {
  const res = await fetch(
    'https://publicsuffix.org/list/public_suffix_list.dat',
    { headers: { Connection: 'close' } },
  )
  if (!res.ok) throw new Error(`expected suffixes: ${res.status}`)
  return (await res.text())
    .split('\n')
    .map((x) => x.trim())
    .filter((x) => x && !x.startsWith('//'))
}

export default deployScript(
  async ({
    deploy,
    execute: write,
    namedAccounts: { deployer, owner },
    tags,
    context,
    viem,
  }) => {
    const psl = await deploy('SimplePublicSuffixList', {
      account: deployer,
      artifact: Artifact_SimplePublicSuffixList,
      args: [],
    })

    // Transfer ownership to owner if different from deployer
    if (owner !== deployer && psl.newlyDeployed) {
      console.log('  - Transferring ownership to owner account')
      await write(psl, {
        functionName: 'transferOwnership',
        args: [owner],
        account: deployer,
      })
    }

    // Fetch and set public suffix list
    const fetchedSuffixes = await fetchPublicSuffixes()
    const allowUnsafe =
      tags?.allow_unsafe ||
      (tags?.test && !context.saveDeployments)

    // Right now we're only going to support top-level, non-idna suffixes
    const suffixes = fetchedSuffixes.filter((suffix) =>
      suffix.match(/^[a-z0-9]+$/),
    )
    const batchAmount = allowUnsafe ? 1000 : 100

    console.log(`Starting suffix transactions for ${suffixes.length} suffixes`)
    const totalBatches = Math.ceil(suffixes.length / batchAmount)

    const pendingBatches: Promise<unknown>[] = []
    let nonce = await viem.publicClient.getTransactionCount({
      address: owner,
    })

    const processBatch = async (batch: readonly Hex[]) => {
      // for fresh deploys only
      if (tags?.test && tags?.fresh) {
        pendingBatches.push(write(psl, {
          functionName: 'addPublicSuffixes',
          args: [batch],
          account: owner,
          nonce: nonce++,
        }))
        await new Promise((resolve) => setTimeout(resolve, 1000))
        return
      }

      // Send transactions sequentially to avoid nonce conflicts
      // For real/live deploys, we don't need to attempt to save time
      await write(psl, {
        functionName: 'addPublicSuffixes',
        args: [batch],
        account: owner,
      })
    }

    for (let i = 0; i < suffixes.length; i += batchAmount) {
      const batch = suffixes
        .slice(i, i + batchAmount)
        .map((suffix) => dnsEncodeName(suffix))

      const batchIndex = Math.floor(i / batchAmount) + 1
      console.log(
        `  - Sending suffixes batch ${batchIndex}/${totalBatches} (${batch.length} suffixes)`,
      )

      await processBatch(batch)
    }
    await Promise.all(pendingBatches)

    console.log(`Public suffix list configuration completed.`)
  },
  {
    id: 'SimplePublicSuffixList v1.0.0',
    tags: ['category:dnsregistrar', 'SimplePublicSuffixList'],
    dependencies: [],
  },
)
