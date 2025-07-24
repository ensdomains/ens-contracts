import { execute, artifacts } from '@rocketh'
import { zeroAddress, zeroHash } from 'viem'

export default execute(
  async ({ deploy, get, namedAccounts, network }) => {
    const { deployer, owner } = namedAccounts

    if (network.tags.legacy) {
      console.log('Deploying Legacy ENS Registry...')
      const contract = await deploy('LegacyENSRegistry', {
        account: deployer,
        artifact: artifacts.ENSRegistry,
      })
      console.log(`Legacy ENS Registry deployed at: ${contract.address}`)

      console.log('Deploying ENS Registry with Fallback...')
      await deploy('ENSRegistry', {
        account: deployer,
        artifact: artifacts.ENSRegistryWithFallback,
        args: [contract.address],
      })
    } else {
      console.log('Deploying standard ENS Registry...')
      await deploy('ENSRegistry', {
        account: deployer,
        artifact: artifacts.ENSRegistry,
      })
    }

    console.log('Registry deployment completed')
  },
  {
    id: 'ENSRegistry v1.0.0',
    tags: ['category:registry', 'ENSRegistry'],
  },
)
