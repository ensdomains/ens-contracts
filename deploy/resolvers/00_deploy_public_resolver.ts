import { execute, artifacts } from '@rocketh'
import { getAddress, namehash } from 'viem'

export default execute(
  async ({ deploy, get, namedAccounts, viem }) => {
    const { deployer, owner } = namedAccounts

    // Get dependencies
    const registry = await get('ENSRegistry')
    const nameWrapper = await get('NameWrapper')
    const controller = await get('ETHRegistrarController')
    const reverseRegistrar = await get('ReverseRegistrar')

    // Deploy PublicResolver
    const publicResolverDeployment = await deploy('PublicResolver', {
      account: deployer,
      artifact: artifacts.PublicResolver,
      args: [
        registry.address,
        nameWrapper.address,
        controller.address,
        reverseRegistrar.address,
      ],
    })

    // Set PublicResolver as default resolver on ReverseRegistrar
    // Note: using 'as any' because rocketh's dynamic proxy doesn't have full type safety
    const isReverseRegistrarDefaultResolver = await (
      reverseRegistrar as any
    ).read
      .defaultResolver()
      .then(
        (v: any) =>
          getAddress(v) === getAddress(publicResolverDeployment.address),
      )
    if (!isReverseRegistrarDefaultResolver) {
      const reverseRegistrarSetDefaultResolverHash = await (
        reverseRegistrar as any
      ).write.setDefaultResolver([publicResolverDeployment.address], {
        account: owner,
      })
      console.log(
        `Setting default resolver on ReverseRegistrar to PublicResolver (tx: ${reverseRegistrarSetDefaultResolverHash})...`,
      )
      await viem.waitForTransactionSuccess(
        reverseRegistrarSetDefaultResolverHash,
      )
    }

    // Set up resolver.eth domain
    const resolverEthOwner = await (registry as any).read.owner([
      namehash('resolver.eth'),
    ])

    if (resolverEthOwner === owner.address) {
      const publicResolver = await get('PublicResolver')

      // Set resolver for resolver.eth
      const setResolverHash = await (registry as any).write.setResolver(
        [namehash('resolver.eth'), publicResolver.address],
        {
          account: owner,
        },
      )
      console.log(
        `Setting resolver for resolver.eth to PublicResolver (tx: ${setResolverHash})...`,
      )
      await viem.waitForTransactionSuccess(setResolverHash)

      // Set address record for resolver.eth
      const setAddrHash = await (publicResolver as any).write.setAddr(
        [namehash('resolver.eth'), publicResolver.address],
        {
          account: owner,
        },
      )
      console.log(
        `Setting address for resolver.eth to PublicResolver (tx: ${setAddrHash})...`,
      )
      await viem.waitForTransactionSuccess(setAddrHash)
    } else {
      console.log(
        'resolver.eth is not owned by the owner address, not setting resolver',
      )
    }
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
