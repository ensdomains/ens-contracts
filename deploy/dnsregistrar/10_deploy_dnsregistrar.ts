import { artifacts, deployScript } from '@rocketh'
import { isAddressEqual, zeroAddress, type Address } from 'viem'

export default deployScript(
  async ({ deploy, get, getOrNull, read, execute: write, namedAccounts }) => {
    const { deployer, owner } = namedAccounts

    const registry = get<(typeof artifacts.ENSRegistry)['abi']>('ENSRegistry')
    const dnssec = get<(typeof artifacts.DNSSECImpl)['abi']>('DNSSECImpl')
    const resolver = get<(typeof artifacts.OffchainDNSResolver)['abi']>(
      'OffchainDNSResolver',
    )
    const root = get<(typeof artifacts.Root)['abi']>('Root')
    const publicSuffixList = get<
      (typeof artifacts.SimplePublicSuffixList)['abi']
    >('SimplePublicSuffixList')

    console.log('  - Searching for old registrars...')
    let oldRegistrarAddress =
      getOrNull<(typeof artifacts.DNSRegistrar)['abi']>('DNSRegistrar')
        ?.address ?? zeroAddress
    const oldRegistrars: Address[] = []
    while (oldRegistrarAddress !== zeroAddress) {
      oldRegistrars.push(oldRegistrarAddress)
      oldRegistrarAddress = await read(
        {
          address: oldRegistrarAddress,
          abi: artifacts.DNSRegistrar.abi,
        },
        { functionName: 'previousRegistrar' },
      ).catch(() => zeroAddress)
    }
    console.log(`  - Found ${oldRegistrars.length} old registrars`)
    oldRegistrars.forEach((x, i) => {
      console.log(`    ${i + 1}. ${x}`)
    })

    const dnsRegistrar = await deploy('DNSRegistrar', {
      account: deployer,
      artifact: artifacts.DNSRegistrar,
      args: [
        oldRegistrars,
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
    const rootOwner = await read(root, { functionName: 'owner' })
    if (isAddressEqual(rootOwner, owner)) {
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
    id: 'DNSRegistrar:contract v1.0.1',
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
