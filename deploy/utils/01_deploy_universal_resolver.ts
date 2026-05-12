import { artifacts, deployScript } from '@rocketh'

export default deployScript(
  async ({ deploy, get, namedAccounts }) => {
    const { deployer, owner } = namedAccounts

    const registry = get<(typeof artifacts.ENSRegistry)['abi']>('ENSRegistry')
    const batchGatewayProvider = get<(typeof artifacts.GatewayProvider)['abi']>(
      'BatchGatewayProvider',
    )

    await deploy('UniversalResolver', {
      account: deployer,
      artifact: artifacts.UniversalResolver,
      args: [owner, registry.address, batchGatewayProvider.address],
    })

    return true
  },
  {
    id: 'UniversalResolver v1.0.1',
    tags: ['category:utils', 'UniversalResolver'],
    dependencies: ['ENSRegistry', 'BatchGatewayProvider'],
  },
)
