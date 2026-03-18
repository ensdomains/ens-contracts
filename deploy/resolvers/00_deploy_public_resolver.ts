import { deployScript } from '@rocketh'
import type { Abi_ENSRegistry } from 'generated/abis/ENSRegistry.js'
import type { Abi_ETHRegistrarController } from 'generated/abis/ETHRegistrarController.js'
import type { Abi_NameWrapper } from 'generated/abis/NameWrapper.js'
import type { Abi_ReverseRegistrar } from 'generated/abis/ReverseRegistrar.js'
import { Artifact_PublicResolver } from 'generated/artifacts/PublicResolver.js'
import { getAddress, namehash, type Address } from 'viem'

export default deployScript(
  async ({ deploy, get, execute: write, read, namedAccounts, network, tags }) => {
    const { deployer, owner } = namedAccounts

    // Get dependencies
    const registry = get<Abi_ENSRegistry>('ENSRegistry')
    const nameWrapper = get<Abi_NameWrapper>('NameWrapper')
    const controller = get<Abi_ETHRegistrarController>(
      'ETHRegistrarController',
    )
    const reverseRegistrar =
      get<Abi_ReverseRegistrar>('ReverseRegistrar')

    // Deploy PublicResolver
    const publicResolver = await deploy('PublicResolver', {
      account: deployer,
      artifact: Artifact_PublicResolver,
      args: [
        registry.address,
        nameWrapper.address,
        controller.address,
        reverseRegistrar.address,
      ],
    })

    if (!publicResolver.newlyDeployed) return

    // Only attempt to make controller etc changes directly on testnets
    if (network.chain.id === 1 && !tags?.tenderly) return

    // Check if PublicResolver is already the default resolver on ReverseRegistrar
    const isReverseRegistrarDefaultResolver = await read(reverseRegistrar, {
      functionName: 'defaultResolver',
      args: [],
    }).then(
      (v) => getAddress(v as Address) === getAddress(publicResolver.address),
    )
    if (!isReverseRegistrarDefaultResolver) {
      console.log(
        `  - Setting PublicResolver as default resolver on ReverseRegistrar`,
      )
      await write(reverseRegistrar, {
        functionName: 'setDefaultResolver',
        args: [publicResolver.address],
        account: owner,
      })
    }

    const resolverEthOwner = await read(registry, {
      functionName: 'owner',
      args: [namehash('resolver.eth')],
    })

    if (resolverEthOwner === owner) {
      console.log(`  - Setting resolver for resolver.eth to PublicResolver`)
      await write(registry, {
        functionName: 'setResolver',
        args: [namehash('resolver.eth'), publicResolver.address],
        account: owner,
      })

      console.log(`  - Setting addr for resolver.eth to PublicResolver`)
      await write(publicResolver, {
        functionName: 'setAddr',
        args: [namehash('resolver.eth'), publicResolver.address],
        account: owner,
      })
    } else {
      console.warn(
        `  - WARN: resolver.eth is not owned by the owner address, not setting resolver`,
      )
    }

    return true;
  },
  {
    id: 'PublicResolver v3.0.0',
    tags: ['category:resolvers', 'PublicResolver'],
    dependencies: [
      'ENSRegistry',
      'NameWrapper',
      'ETHRegistrarController',
      'ReverseRegistrar',
    ],
  },
)
