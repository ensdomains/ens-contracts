import type { DeployFunction } from 'hardhat-deploy/types.js'
import type { Hash } from 'viem'
import { dnsEncodeName } from '../../test/fixtures/dnsEncodeName.js'

const func: DeployFunction = async function (hre) {
  const { viem } = hre

  const { deployer, owner } = await viem.getNamedClients()

  await viem.deploy('SimplePublicSuffixList', [])

  const psl = await viem.getContract('SimplePublicSuffixList')
  const listOwner = await psl.read.owner()

  if (
    owner !== undefined &&
    owner.address !== deployer.address &&
    listOwner !== owner.address
  ) {
    console.log('Transferring ownership to owner account')
    const hash = await psl.write.transferOwnership([owner.address])
    console.log(`Transfer ownership (tx: ${hash})...`)
    await viem.waitForTransactionSuccess(hash)
  }

  const suffixList = await (
    await fetch('https://publicsuffix.org/list/public_suffix_list.dat')
  ).text()
  let suffixes = suffixList
    .split('\n')
    .filter((suffix) => !suffix.startsWith('//') && suffix.trim() != '')
  // Right now we're only going to support top-level, non-idna suffixes
  suffixes = suffixes.filter((suffix) => suffix.match(/^[a-z0-9]+$/))

  const transactionHashes: Hash[] = []
  console.log('Starting suffix transactions')

  for (let i = 0; i < suffixes.length; i += 100) {
    const batch = suffixes
      .slice(i, i + 100)
      .map((suffix) => dnsEncodeName(suffix))
    const hash = await psl.write.addPublicSuffixes([batch], {
      account: owner.account,
    })
    console.log(`Setting suffixes (tx: ${hash})...`)
    transactionHashes.push(hash)
  }
  console.log(
    `Waiting on ${transactionHashes.length} suffix-setting transactions to complete...`,
  )
  await Promise.all(
    transactionHashes.map((hash) => viem.waitForTransactionSuccess(hash)),
  )
}

func.tags = ['SimplePublicSuffixList']
func.dependencies = []

export default func
