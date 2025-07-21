import { execute, artifacts } from '@rocketh'
import { zeroAddress } from 'viem'

export default execute(
  async ({ deploy, get, getOrNull, read, execute, namedAccounts }) => {
    const { deployer, owner } = namedAccounts

    const registry = await get('ENSRegistry')
    const dnssec = await get('DNSSECImpl')
    const resolver = await get('OffchainDNSResolver')
    const oldregistrar = await getOrNull('DNSRegistrar')
    const root = await get('Root')
    const publicSuffixList = await get('SimplePublicSuffixList')

    const dnsRegistrar = await deploy('DNSRegistrar', {
      account: deployer,
      artifact: artifacts.DNSRegistrar,
      args: [
        oldregistrar?.address || zeroAddress,
        resolver.address,
        dnssec.address,
        publicSuffixList.address,
        registry.address,
      ],
    })

    if (!dnsRegistrar.newlyDeployed) {
      return
    }

    console.log('DNSRegistrar deployed successfully')

    // Set DNSRegistrar as controller of Root
    const rootOwner = await read(root, {
      functionName: 'owner',
    })

    if (rootOwner === owner) {
      await execute(root, {
        functionName: 'setController',
        args: [dnsRegistrar.address, true],
        account: owner,
      })
      console.log('Set DNSRegistrar as controller of Root')
    } else {
      console.log(
        `${owner} is not the owner of the root; you will need to call setController('${dnsRegistrar.address}', true) manually`,
      )
    }
  },
  {
    id: 'DNSRegistrar:contract v1.0.0',
    tags: ['category:dnsregistrar', 'DNSRegistrar', 'DNSRegistrar:contract'],
    dependencies: [
      'ENSRegistry',
      'DNSSECImpl',
      'OffchainDNSResolver',
      'Root',
      'SimplePublicSuffixList',
    ],
  },
)
