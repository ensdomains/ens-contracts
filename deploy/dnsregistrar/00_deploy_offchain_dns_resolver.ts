import { deployScript } from '@rocketh'
import type { Abi_DNSSECImpl } from "generated/abis/DNSSECImpl.js"
import type { Abi_ENSRegistry } from "generated/abis/ENSRegistry.js"
import { Artifact_OffchainDNSResolver } from "generated/artifacts/OffchainDNSResolver.js"

export default deployScript(
  async ({ deploy, get, namedAccounts }) => {
    const { deployer } = namedAccounts

    const registry = get<Abi_ENSRegistry>('ENSRegistry')
    const dnssec = get<Abi_DNSSECImpl>('DNSSECImpl')

    await deploy('OffchainDNSResolver', {
      account: deployer,
      artifact: Artifact_OffchainDNSResolver,
      args: [
        registry.address,
        dnssec.address,
        'https://dnssec-oracle.ens.domains/',
      ],
    })

    return true;
  },
  {
    id: 'OffchainDNSResolver v1.0.0',
    tags: ['category:dnsregistrar', 'OffchainDNSResolver'],
    dependencies: ['ENSRegistry', 'DNSSECImpl'],
  },
)
