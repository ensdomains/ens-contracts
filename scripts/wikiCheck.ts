import * as fs from 'fs'
import * as path from 'path'

const SUPPORTED_CHAINS = ['mainnet', 'sepolia', 'holesky'] as const
//Updates to the wiki take 5 minutes to show up on this URL
const WIKI_DEPLOYMENTS_URL =
  'https://raw.githubusercontent.com/wiki/ensdomains/ens-contracts/ENS-Contract-Deployments.md'

type CheckChainParameters = {
  chainIndex: number
  lines: string[]
}

const getChainDeploymentsFromWiki = ({
  chainIndex,
  lines,
}: CheckChainParameters) => {
  const chainName = SUPPORTED_CHAINS[chainIndex]
  const indexOfChain = lines.findIndex((line) => line.includes(chainName))
  const indexOfNextChain = lines.findIndex(
    (line, index) => index > indexOfChain && line.includes('#'),
  )
  const startOfChainDeployments = indexOfChain + 3

  if (indexOfNextChain === -1) {
    //If no next chain, then we are at the end of the file
    const chainDeployments = lines.slice(startOfChainDeployments, lines.length)
    return chainDeployments
  }

  const chainDeployments = lines.slice(
    startOfChainDeployments,
    indexOfNextChain,
  )
  return chainDeployments
}

const checkDeployment = async ({
  chainName,
  deploymentFilenames,
  wikiDeployments,
  deploymentIndex,
}: {
  chainName: (typeof SUPPORTED_CHAINS)[number]
  deploymentFilenames: string[]
  wikiDeployments: string[]
  deploymentIndex: number
}) => {
  const deploymentFilename = deploymentFilenames[deploymentIndex]

  const wikiDeploymentString = wikiDeployments.find((wikiDeployment) => {
    const wikiDeploymentName = wikiDeployment.split('|')[1].trim()

    const match = wikiDeploymentName.match(
      new RegExp(`${deploymentFilename.split('.')[0].trim()}`),
    )
    return match && match?.[0] === match?.input
  })

  if (!wikiDeploymentString)
    throw new Error(
      `Deployment ${deploymentIndex} not found in wiki for ${chainName}`,
    )

  const wikiDeploymentAddress = wikiDeploymentString.substring(
    wikiDeploymentString.indexOf('[') + 1,
    wikiDeploymentString.lastIndexOf(']'),
  )
  const wikiEtherscanAddress = wikiDeploymentString.substring(
    wikiDeploymentString.lastIndexOf('/') + 1,
    wikiDeploymentString.lastIndexOf(')'),
  )

  const deployment = await import(
    `../deployments/${chainName}/${deploymentFilename}`
  )

  if (deployment.address !== wikiDeploymentAddress) {
    throw new Error(
      `Deployment ${deploymentIndex} in wiki and in the repository do not match for ${chainName}. Wiki: ${wikiDeploymentAddress}, Deployment: ${deployment.address}`,
    )
  }

  if (deployment.address !== wikiEtherscanAddress) {
    throw new Error(
      `Etherscan address ${deploymentIndex} in wiki and in the repository do not match for ${chainName}. Wiki Etherscan: ${wikiEtherscanAddress}, Deployment: ${deployment.address}`,
    )
  }
}

const checkChain = async ({ chainIndex, lines }: CheckChainParameters) => {
  const chainName = SUPPORTED_CHAINS[chainIndex]
  const directoryPath = path.resolve(__dirname, '../', 'deployments', chainName)

  const files = await fs.promises.readdir(directoryPath)
  const deploymentFilenames = files.filter((file) => {
    // Don't include migrations file
    if (file.startsWith('.')) return false
    if (path.extname(file).toLowerCase() !== '.json') return false

    return true
  })

  const wikiDeployments = getChainDeploymentsFromWiki({ chainIndex, lines })

  if (wikiDeployments.length !== deploymentFilenames.length) {
    throw new Error(
      `Number of deployments in wiki and in the repository do not match for ${SUPPORTED_CHAINS[chainIndex]}`,
    )
  }

  for (let i = 0; i < wikiDeployments.length; i++) {
    await checkDeployment({
      chainName,
      deploymentFilenames,
      wikiDeployments,
      deploymentIndex: i,
    })
  }
}

const data = await fetch(WIKI_DEPLOYMENTS_URL).then((res) => res.text())
const lines = data.split('\n')

for (let i = 0; i < SUPPORTED_CHAINS.length; i++) {
  await checkChain({ chainIndex: i, lines })
}

console.log('All deployments match')
