import type { DeployFunction } from 'hardhat-deploy/types.js'

const func: DeployFunction = async function (hre) {
  const { network, viem } = hre

  let metadataHost =
    process.env.METADATA_HOST || 'ens-metadata-service.appspot.com'

  if (network.name === 'localhost') {
    metadataHost = 'http://localhost:8080'
  }

  const metadataUrl = `${metadataHost}/name/0x{id}`

  await viem.deploy('StaticMetadataService', [metadataUrl])
}

func.id = 'metadata'
func.tags = ['wrapper', 'StaticMetadataService']
// technically not a dep, but we want to make sure it's deployed first for the consistent address
func.dependencies = ['BaseRegistrarImplementation']

export default func
