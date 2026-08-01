import { deployScript } from '@rocketh'
import type { Abi_DNSSECImpl } from "generated/abis/DNSSECImpl.js"
import type { Abi_ENSRegistry } from "generated/abis/ENSRegistry.js"
import type { Abi_OffchainDNSResolver } from "generated/abis/OffchainDNSResolver.js"
import type { Abi_Root } from "generated/abis/Root.js"
import type { Abi_SimplePublicSuffixList } from "generated/abis/SimplePublicSuffixList.js"
import { Artifact_DNSRegistrar } from "generated/artifacts/DNSRegistrar.js"
import { getAddress, zeroAddress, type Address } from 'viem'

export default deployScript(
  async ({ deploy, get, getOrNull, read, execute: write, namedAccounts }) => {
    const { deployer, owner } = namedAccounts

    const registry = get<Abi_ENSRegistry>('ENSRegistry')
    const dnssec = get<Abi_DNSSECImpl>('DNSSECImpl')
    const resolver = get<Abi_OffchainDNSResolver>(
      'OffchainDNSResolver',
    )
    const oldregistrar = getOrNull('DNSRegistrar')
    const root = get<Abi_Root>('Root')
    const publicSuffixList = get<Abi_SimplePublicSuffixList>('SimplePublicSuffixList')

    const dnsRegistrar = await deploy('DNSRegistrar', {
      account: deployer,
      artifact: Artifact_DNSRegistrar,
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

    return true;
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
