import { execute, artifacts } from '@rocketh'

export default execute(
  async ({ deploy, namedAccounts, network }) => {
    const { deployer } = namedAccounts

    let metadataHost =
      process.env.METADATA_HOST || 'ens-metadata-service.appspot.com'

    if (network.name === 'localhost') {
      metadataHost = 'http://localhost:8080'
    }

    const metadataUrl = `${metadataHost}/name/0x{id}`

    await deploy('StaticMetadataService', {
      account: deployer,
      artifact: artifacts.StaticMetadataService,
      args: [metadataUrl],
    })
  },
  {
    id: 'StaticMetadataService v1.0.0',
    tags: ['category:wrapper', 'StaticMetadataService'],
    // technically not a dep, but we want to make sure it's deployed first for the consistent address
    dependencies: ['BaseRegistrarImplementation'],
  },
)
