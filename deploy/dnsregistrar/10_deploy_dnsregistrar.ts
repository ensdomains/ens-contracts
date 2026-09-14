import { artifacts, deployScript } from '@rocketh'
import { getAddress, zeroAddress, type Address } from 'viem'

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
    let oldRegistrarAddress: Address | undefined =
      getOrNull<(typeof artifacts.DNSRegistrar)['abi']>('DNSRegistrar')?.address
    const oldRegistrars: Address[] = []
    if (oldRegistrarAddress) {
      while (true) {
        oldRegistrars.push(oldRegistrarAddress)
        try {
          oldRegistrarAddress = await read(
            {
              address: oldRegistrarAddress,
              abi: artifacts.DNSRegistrar.abi,
            },
            { functionName: 'previousRegistrar' },
          )
          if (oldRegistrarAddress === zeroAddress) break
        } catch {
          break
        }
      }
    }
    console.log(`  - Found ${oldRegistrars.length} old registrars`)
    if (oldRegistrars.length) {
      console.table(oldRegistrars)
    }

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
