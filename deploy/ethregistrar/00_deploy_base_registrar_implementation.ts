import { artifacts, deployScript } from '@rocketh'
import { namehash } from 'viem/ens'

export default deployScript(
  async ({ deploy, get, namedAccounts, network }) => {
    const { deployer } = namedAccounts

    if (!network.tags?.use_root) {
      return
    }

    const registry = get<(typeof artifacts.ENSRegistry)['abi']>('ENSRegistry')

    await deploy('BaseRegistrarImplementation', {
      account: deployer,
      artifact: artifacts.BaseRegistrarImplementation,
      args: [registry.address, namehash('eth')],
    })
  },
  {
    id: 'BaseRegistrarImplementation:contract v1.0.0',
    tags: [
      'category:ethregistrar',
      'BaseRegistrarImplementation',
      'BaseRegistrarImplementation:contract',
    ],
    dependencies: ['ENSRegistry'],
  },
)
