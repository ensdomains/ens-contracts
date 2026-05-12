import fs from 'fs'
import path from 'path'
import { holesky, mainnet, sepolia } from 'viem/chains'

const WIKI_DEPLOYMENTS_URL =
  'https://raw.githubusercontent.com/wiki/ensdomains/ens-contracts/ENS-Contract-Deployments.md'

const chains = [
  ['mainnet', mainnet],
  ['sepolia', sepolia],
  ['holesky', holesky],
] as const

// Wiki format:
// # <chain-name>
// | Assets | Contracts |
// |--------|----------|
// | <contract-name> | [<contract-address>](<block-explorer>/address/<contract-address>) |
// [...other contracts...]

const deploymentNameToWikiName = (deploymentName: string) => {
  const reverseResolverMatch = deploymentName.match(/^(.+)ReverseResolver$/)
  if (reverseResolverMatch) {
    if (reverseResolverMatch[1] === 'Default') return deploymentName
    return `ChainReverseResolver:${reverseResolverMatch[1]}`
  }
  return deploymentName
}

const wikiNameToDeploymentName = (wikiName: string) => {
  const reverseResolverMatch = wikiName.match(/^ChainReverseResolver:(.+)$/)
  if (reverseResolverMatch) return `${reverseResolverMatch[1]}ReverseResolver`
  return wikiName
}

const fetchWikiDeployments = async () => {
  // Fetch and parse deployments from wiki
  const wikiResponse = await fetch(WIKI_DEPLOYMENTS_URL)
  const wikiContent = await wikiResponse.text()

  // Parse the wiki content to extract deployments
  const chainDeployments = new Map<
    (typeof chains)[number][0],
    Map<string, string>
  >()

  // Split content by chain sections
  const chainSections = wikiContent.split(/^# /m).slice(1)

  for (const section of chainSections) {
    const lines = section.split('\n')
    const chainName = lines[0].trim() as (typeof chains)[number][0]
    const deployments = new Map<string, string>()

    // Find table rows and extract contract name and address
    for (const line of lines) {
      const tableRowMatch = line.match(/^\| (.+?) \| \[(.+?)\]\(.+?\) \|$/)
      if (tableRowMatch) {
        const contractName = tableRowMatch[1].trim()
        const contractAddress = tableRowMatch[2].trim()
        if (contractName !== 'Assets' && contractAddress !== 'Contracts') {
          deployments.set(
            wikiNameToDeploymentName(contractName),
            contractAddress,
          )
        }
      }
    }

    if (deployments.size > 0) {
      chainDeployments.set(chainName, deployments)
    }
  }

  return chainDeployments
}

const createLocalDeployments = () => {
  const chainDeployments = new Map<
    (typeof chains)[number][0],
    Map<string, string>
  >()
  // Get deployment files for each chain
  for (const [chainName, chain] of chains) {
    const deploymentPath = path.join('./deployments', chainName)

    if (fs.existsSync(deploymentPath)) {
      const deploymentFiles = fs
        .readdirSync(deploymentPath)
        .filter((file) => file.endsWith('.json') && !file.startsWith('.'))
        .sort()

      const deployments = new Map<string, string>()
      for (const deploymentFile of deploymentFiles) {
        const json = JSON.parse(
          fs.readFileSync(path.join(deploymentPath, deploymentFile), 'utf8'),
        )

        const contractName = deploymentFile.split('.json')[0]
        const contractAddress = json.address
        deployments.set(contractName, contractAddress)
      }

      chainDeployments.set(chainName, deployments)
    } else {
      console.log(`No deployment directory found for ${chainName}`)
    }
  }

  return chainDeployments
}

const bold = (text: string) => `\x1b[1m${text}\x1b[0m`
const red = (text: string) => `\x1b[31m${text}\x1b[0m`
const darkRed = (t: string): string => `\x1b[2m\x1b[31m${t}\x1b[0m`
const yellow = (text: string) => `\x1b[33m${text}\x1b[0m`
const green = (text: string) => `\x1b[32m${text}\x1b[0m`

const checkForMismatchingDeployments = async () => {
  const wikiDeployments = await fetchWikiDeployments()
  const localDeployments = createLocalDeployments()

  let isError = false

  for (const [chainName, chainDeployments] of localDeployments) {
    console.log(`\n${bold(chainName)}`)
    const wikiChainDeployments = wikiDeployments.get(chainName)
    let chainErrors = []
    if (!wikiChainDeployments) {
      chainErrors.push(red(`No existing wiki deployments for chain`))
      continue
    }

    for (const [deploymentName, deploymentAddress] of chainDeployments) {
      const existingDeploymentAddress = wikiChainDeployments.get(deploymentName)
      if (!existingDeploymentAddress) {
        chainErrors.push(red(`${deploymentName}: No existing wiki deployment`))
        continue
      }
      if (existingDeploymentAddress !== deploymentAddress) {
        chainErrors.push(
          [
            bold(red(`${deploymentName}: Mismatching deployment`)),
            darkRed(`    Wiki: ${existingDeploymentAddress}`),
            darkRed(`    Local: ${deploymentAddress}`),
          ].join('\n'),
        )
        continue
      }
    }

    if (chainErrors.length > 0) {
      isError = true
      // console.log(`${chainName}: Mismatching deployments \x1b[31m✗\x1b[0m`)
      for (let i = 0; i < chainErrors.length; i++) {
        const error = chainErrors[i]
        console.log(bold(red(`✗ ${chainName} > `)) + error)
        if (i < chainErrors.length - 1) console.log()
      }
    } else {
      console.log(`${chainName}: All deployments match ✓`)
    }
  }

  if (isError) process.exit(1)
  process.exit(0)
}

const createNewWiki = () => {
  const localDeployments = createLocalDeployments()

  for (const [chainName, chainDeployments] of localDeployments) {
    const chain = chains.find(([name]) => name === chainName)![1]
    console.log(`# ${chainName}`)

    const markdownTable = Array.from(chainDeployments.entries()).reduce(
      (acc, [contractName, contractAddress]) => {
        return `${acc}
| ${contractName} | [${contractAddress}](${chain.blockExplorers?.default.url}/address/${contractAddress}) |`
      },
      '| Assets | Contracts |\n|--------|----------|',
    )

    console.log(markdownTable)
  }
}

const args = process.argv.slice(2)

if (args[0] === 'check') {
  await checkForMismatchingDeployments()
} else if (args[0] === 'create') {
  createNewWiki()
} else {
  console.log('Usage: bun wiki check|create')
}
