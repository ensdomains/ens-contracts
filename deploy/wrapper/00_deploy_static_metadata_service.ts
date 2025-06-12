import type { DeployFunction } from 'hardhat-deploy/types.js'

const func: DeployFunction = async function (hre) {
  const { network, viem } = hre

  let metadataHost =
    process.env.METADATA_HOST ||
    'https://metadata.ens.domains/mainnet/0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401'

  if (network.name === 'localhost') {
    metadataHost = 'http://localhost:8080'
  }

  const metadataUrl = `${metadataHost}/{id}`

  await viem.deploy('StaticMetadataService', [metadataUrl])
}

func.id = 'metadata'
func.tags = ['wrapper', 'StaticMetadataService']
// technically not a dep, but we want to make sure it's deployed first for the consistent address
func.dependencies = ['BaseRegistrarImplementation']

export default func
