import { artifacts, deployScript } from '@rocketh'

export default deployScript(
  async ({ deploy, get, namedAccounts }) => {
    const { deployer } = namedAccounts

    const registry = get<(typeof artifacts.ENSRegistry)['abi']>('ENSRegistry')
    const dnssec = get<(typeof artifacts.DNSSECImpl)['abi']>('DNSSECImpl')

    await deploy('OffchainDNSResolver', {
      account: deployer,
      artifact: artifacts.OffchainDNSResolver,
      args: [
        registry.address,
        dnssec.address,
        'https://dnssec-oracle.ens.domains/',
      ],
    })
  },
  {
    id: 'OffchainDNSResolver v1.0.0',
    tags: ['category:dnsregistrar', 'OffchainDNSResolver'],
    dependencies: ['ENSRegistry', 'DNSSECImpl'],
  },
)
