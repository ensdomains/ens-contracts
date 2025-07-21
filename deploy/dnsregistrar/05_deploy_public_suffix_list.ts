import { execute, artifacts } from '@rocketh'
import type { Hash } from 'viem'
import { dnsEncodeName } from '../../test/fixtures/dnsEncodeName.js'

export default execute(
  async ({ deploy, execute, namedAccounts }) => {
    const { deployer, owner } = namedAccounts

    const psl = await deploy('SimplePublicSuffixList', {
      account: deployer,
      artifact: artifacts.SimplePublicSuffixList,
      args: [],
    })

    if (!psl.newlyDeployed) {
      return
    }

    console.log('SimplePublicSuffixList deployed successfully')

    // Transfer ownership to owner if different from deployer
    if (owner !== deployer) {
      await execute(psl, {
        functionName: 'transferOwnership',
        args: [owner],
        account: deployer,
      })
      console.log('Transferred ownership to owner account')
    }

    // Fetch and set public suffix list
    const suffixList = await (
      await fetch('https://publicsuffix.org/list/public_suffix_list.dat', {
        headers: {
          Connection: 'close',
        },
      })
    ).text()

    let suffixes = suffixList
      .split('\n')
      .filter((suffix) => !suffix.startsWith('//') && suffix.trim() != '')
    // Right now we're only going to support top-level, non-idna suffixes
    suffixes = suffixes.filter((suffix) => suffix.match(/^[a-z0-9]+$/))

    const transactionPromises: Promise<any>[] = []
    console.log('Starting suffix transactions')

    for (let i = 0; i < suffixes.length; i += 100) {
      const batch = suffixes
        .slice(i, i + 100)
        .map((suffix) => dnsEncodeName(suffix))

      const txPromise = execute(psl, {
        functionName: 'addPublicSuffixes',
        args: [batch],
        account: owner,
      })
      transactionPromises.push(txPromise)
      console.log(
        `Queued suffixes batch ${Math.floor(i / 100) + 1}/${Math.ceil(
          suffixes.length / 100,
        )}`,
      )
    }

    console.log(
      `Waiting on ${transactionPromises.length} suffix-setting transactions to complete...`,
    )
    const results = await Promise.allSettled(transactionPromises)

    // Check results and log any failures
    const failed = results.filter((result, index) => {
      if (result.status === 'rejected') {
        console.error(`Batch ${index + 1} failed:`, result.reason)
        return true
      }
      return false
    })

    if (failed.length > 0) {
      console.log(`${failed.length} batches failed, but continuing...`)
    }

    console.log('Public suffix list configuration completed')
  },
  {
    id: 'SimplePublicSuffixList v1.0.0',
    tags: ['category:dnsregistrar', 'SimplePublicSuffixList'],
    dependencies: [],
  },
)
