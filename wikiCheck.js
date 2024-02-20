const https = require('https')
const fs = require('fs')
const path = require('path')

const SUPPORTED_CHAINS = ['mainnet', 'sepolia', 'holesky']
//Updates to the wiki take 5 minutes to show up on this URL
const WIKI_DEPLOYMENTS_URL =
  'https://raw.githubusercontent.com/wiki/ensdomains/ens-contracts/ENS-Contract-Deployments.md'

const getRawWikiData = (url) => {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = ''

      res.on('data', (chunk) => {
        data += chunk
      })

      res.on('end', () => {
        resolve(data)
      })

      res.on('error', (err) => {
        reject(err)
      })
    })
  })
}

const getChainDeploymentsFromWiki = (chainIndex, lines) => {
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

const checkDeployment = (
  chainName,
  deploymentFilenames,
  wikiDeployments,
  i,
) => {
  const deploymentFilename = deploymentFilenames[i]

  const wikiDeploymentString = wikiDeployments.find((wikiDeployment) => {
    const wikiDeploymentName = wikiDeployment.split('|')[1].trim()

    const match = wikiDeploymentName.match(
      new RegExp(`${deploymentFilename.split('.')[0].trim()}`),
    )
    return match && match?.[0] === match?.input
  })

  const wikiDeploymentAddress = wikiDeploymentString.substring(
    wikiDeploymentString.indexOf('[') + 1,
    wikiDeploymentString.lastIndexOf(']'),
  )
  const wikiEtherscanAddress = wikiDeploymentString.substring(
    wikiDeploymentString.lastIndexOf('/') + 1,
    wikiDeploymentString.lastIndexOf(')'),
  )

  const deployment = require(`./deployments/${chainName}/${deploymentFilename}`)

  if (deployment.address !== wikiDeploymentAddress) {
    throw new Error(
      `Deployment ${i} in wiki and in the repository do not match for ${chainName}. Wiki: ${wikiDeploymentAddress}, Deployment: ${deployment.address}`,
    )
  }

  if (deployment.address !== wikiEtherscanAddress) {
    throw new Error(
      `Etherscan address ${i} in wiki and in the repository do not match for ${chainName}. Wiki Etherscan: ${wikiEtherscanAddress}, Deployment: ${deployment.address}`,
    )
  }
}

const checkChain = async (chainIndex, lines) => {
  const chainName = SUPPORTED_CHAINS[chainIndex]
  const directoryPath = path.join(__dirname, 'deployments', chainName)

  let deploymentFilenames = []

  const files = await fs.promises.readdir(directoryPath)
  const jsonFiles = files.filter(
    (file) => path.extname(file).toLowerCase() === '.json',
  )

  //Don't include migrations file
  deploymentFilenames = jsonFiles.slice(1)

  const wikiDeployments = getChainDeploymentsFromWiki(chainIndex, lines)

  if (wikiDeployments.length !== deploymentFilenames.length) {
    throw new Error(
      `Number of deployments in wiki and in the repository do not match for ${SUPPORTED_CHAINS[chainIndex]}`,
    )
  }

  for (let i = 0; i < wikiDeployments.length; i++) {
    checkDeployment(chainName, deploymentFilenames, wikiDeployments, i)
  }
}

const run = async () => {
  const data = await getRawWikiData(WIKI_DEPLOYMENTS_URL)
  const lines = data.split('\n')

  for (let i = 0; i < SUPPORTED_CHAINS.length; i++) {
    await checkChain(i, lines)
  }

  console.log('All deployments match')
}

run()
