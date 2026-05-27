import { artifacts, deployScript } from '@rocketh'

export default deployScript(
  async ({ deploy, namedAccounts, network }) => {
    if (network.name === 'mainnet') {
      console.log('  - Skipping MockSMPXNFT on mainnet (use real contract)')
      return
    }

    const { deployer } = namedAccounts

    await deploy('MockSMPXNFT', {
      account: deployer,
      artifact: artifacts.MockSMPXNFT,
    })
  },
  {
    id: 'MockSMPXNFT v1.0.0',
    tags: ['category:simplex', 'MockSMPXNFT'],
    dependencies: [],
  },
)
