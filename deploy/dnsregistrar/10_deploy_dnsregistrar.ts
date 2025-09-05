import { artifacts, execute } from '@rocketh'
import { getAddress, zeroAddress, type Address } from 'viem'

export default execute(
  async ({ deploy, get, getOrNull, read, execute: write, namedAccounts }) => {
    const { deployer, owner } = namedAccounts

    const registry = get<(typeof artifacts.ENSRegistry)['abi']>('ENSRegistry')
    const dnssec = get<(typeof artifacts.DNSSECImpl)['abi']>('DNSSECImpl')
    const resolver = get<(typeof artifacts.OffchainDNSResolver)['abi']>(
      'OffchainDNSResolver',
    )
    const oldregistrar = getOrNull('DNSRegistrar')
    const root = get<(typeof artifacts.Root)['abi']>('Root')
    const publicSuffixList = get<
      (typeof artifacts.SimplePublicSuffixList)['abi']
    >('SimplePublicSuffixList')

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

    // Set DNSRegistrar as controller of Root
    const rootOwner = await read(root, {
      functionName: 'owner',
    }).then((v) => getAddress(v as Address))

    if (rootOwner === getAddress(owner)) {
      console.log('  - Setting DNSRegistrar as controller of Root')
      await write(root, {
        functionName: 'setController',
        args: [dnsRegistrar.address, true],
        account: owner,
      })
    } else {
      console.warn(
        `  - WARN: ${owner} is not the owner of the root; you will need to call setController('${dnsRegistrar.address}', true) manually`,
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
