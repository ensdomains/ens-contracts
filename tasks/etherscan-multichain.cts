import config = require('hardhat/config')
import { encodeAbiParameters } from 'viem'

const licenseTypes = [
  'None',
  'UNLICENSED',
  'MIT',
  'GPL-2.0',
  'GPL-3.0',
  'LGPL-2.1',
  'LGPL-3.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'MPL-2.0',
  'OSL-3.0',
  'Apache-2.0',
  'AGPL-3.0',
  'BUSL-1.1',
] as const

const getLicenseType = (license: string): number | null => {
  const index = licenseTypes.indexOf(license as (typeof licenseTypes)[number])
  if (index === -1) return null
  return index + 1
}

const extractAllLicenses = (metadata: string): string[] => {
  const regex = /\/\/\s*\t*SPDX-License-Identifier:\s*\t*(.*?)[\s\\]/g
  const matches = [...metadata.matchAll(regex)]
  return matches.map((match) => match[1])
}

const extractOneLicenseFromSourceFile = (source: string): string | null => {
  const licenses = extractAllLicenses(source)
  if (licenses.length === 0) return null
  return licenses[0]
}

config
  .task('multichain-verify')
  .addPositionalParam('contractName')
  .addPositionalParam('address')
  .addOptionalVariadicPositionalParam('deployArgs')
  .setAction(async (args, hre) => {
    const {
      contractName: contractName_,
      address,
      deployArgs: deployArgs_,
    } = args
    const deployArgs = deployArgs_ ?? []
    const { metadata: metadataString, abi } =
      await hre.deployments.getExtendedArtifact(contractName_)
    if (!metadataString) throw new Error('Metadata not found')

    const metadata = JSON.parse(metadataString)
    const compilationTarget = metadata.settings?.compilationTarget
    if (!compilationTarget) throw new Error('Compilation target not found')

    const contractFilepath = Object.keys(compilationTarget)[0]
    const contractName = compilationTarget[contractFilepath]

    if (!contractFilepath || !contractName)
      throw new Error('Contract name not found')

    const contractNamePath = `${contractFilepath}:${contractName}`
    const contractSourceFile = metadata.sources[contractFilepath].content
    const sourceLicenseType =
      extractOneLicenseFromSourceFile(contractSourceFile)

    if (!sourceLicenseType) throw new Error('License not found')

    const licenseType = getLicenseType(sourceLicenseType)
    if (!licenseType) throw new Error('License not supported')

    const settings = { ...metadata.settings }
    delete settings.compilationTarget
    const solcInput = {
      language: metadata.language,
      settings,
      sources: {} as Record<string, { content: string }>,
    }
    for (const sourcePath of Object.keys(metadata.sources)) {
      const source = metadata.sources[sourcePath]
      // only content as this fails otherwise
      solcInput.sources[sourcePath] = {
        content: source.content,
      }
    }

    const solcInputString = JSON.stringify(solcInput)
    console.log(`Verifying ${contractName} (${address}) ...`)

    const description = abi.find((x) => 'type' in x && x.type === 'constructor')
    const constructorArguments =
      deployArgs.length > 0
        ? encodeAbiParameters(description.inputs, deployArgs)
        : undefined

    const formData = new FormData()
    formData.append('chainId', hre.network.config.chainId!.toString())
    formData.append('contractaddress', address)
    formData.append('sourceCode', solcInputString)
    formData.append('codeformat', 'solidity-standard-json-input')
    formData.append('contractName', contractNamePath)
    formData.append('compilerversion', `v${metadata.compiler.version}`)
    if (constructorArguments)
      formData.append('constructorArguements', constructorArguments.slice(2))
    formData.append('licenseType', licenseType.toString())

    const baseUrl = 'https://api.etherscan.io/api'

    const response = await fetch(
      `${baseUrl}?module=contract&action=verifysourcecode&apikey=${process.env.ETHERSCAN_API_KEY}`,
      {
        method: 'POST',
        body: formData,
      },
    )

    const responseData = await response.json()
    const status = responseData.status
    if (status !== '1') throw new Error('Submission failed')

    const guid = responseData.result
    if (!guid) throw new Error('Submission failed')

    async function checkStatus() {
      const statusRequest = await fetch(
        `${baseUrl}?module=contract&action=checkverifystatus&apikey=${process.env.ETHERSCAN_API_KEY}&guid=${guid}`,
      )
      const statusResponse = await statusRequest.json()

      if (statusResponse.result === 'Pending in queue') return null
      if (
        statusResponse.result !== 'Fail - Unable to verify' &&
        statusResponse.status === '1'
      )
        return 'success'

      throw new Error('Verification failed')
    }

    let result
    while (!result) {
      await new Promise((resolve) => setTimeout(resolve, 10 * 1000))
      result = await checkStatus()
    }

    if (result === 'success') {
      console.log(`Verification successful for ${contractName} (${address})`)
    }
  })
