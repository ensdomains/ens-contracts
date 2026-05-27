import { artifacts, deployScript } from '@rocketh'
import { namehash, zeroAddress } from 'viem'

export default deployScript(
  async ({
    deploy,
    get,
    execute: write,
    namedAccounts,
    network,
  }) => {
    const { deployer, owner } = namedAccounts

    const registry = get<(typeof artifacts.ENSRegistry)['abi']>('ENSRegistry')
    const registrar = get<
      (typeof artifacts.BaseRegistrarImplementation)['abi']
    >('BaseRegistrarImplementation')
    const priceOracle = get<
      (typeof artifacts.ExponentialPremiumPriceOracle)['abi']
    >('ExponentialPremiumPriceOracle')
    const reverseRegistrar =
      get<(typeof artifacts.ReverseRegistrar)['abi']>('ReverseRegistrar')
    const defaultReverseRegistrar = get<
      (typeof artifacts.DefaultReverseRegistrar)['abi']
    >('DefaultReverseRegistrar')

    const tld = process.env.SIMPLEX_TLD || 'testing'
    const tldNode = namehash(tld)
    const tldSuffix = `.${tld}`
    const nftGateEnabled = tld === 'testing'
    const smpxNftAddress = nftGateEnabled
      ? (process.env.SMPX_NFT_ADDRESS || zeroAddress)
      : zeroAddress

    const controller = await deploy('SimplexController', {
      account: deployer,
      artifact: artifacts.SimplexController,
      args: [
        registrar.address,
        priceOracle.address,
        60n,
        86400n,
        reverseRegistrar.address,
        defaultReverseRegistrar.address,
        registry.address,
        {
          tldNode,
          tldSuffix,
          minCharLength: 6,
          smpxNft: smpxNftAddress,
          nftGateEnabled,
        },
      ],
    })

    if (!controller.newlyDeployed) return

    if (owner !== deployer) {
      console.log(
        `  - Transferring ownership of SimplexController to ${owner}`,
      )
      await write(controller, {
        functionName: 'transferOwnership',
        args: [owner],
        account: deployer,
      })
    }

    if (network.name === 'mainnet' && !network.tags?.tenderly) return

    console.log(`  - Adding SimplexController as controller on BaseRegistrar`)
    await write(registrar, {
      functionName: 'addController',
      args: [controller.address],
      account: owner,
    })

    console.log(
      `  - Adding SimplexController as controller on ReverseRegistrar`,
    )
    await write(reverseRegistrar, {
      functionName: 'setController',
      args: [controller.address, true],
      account: owner,
    })

    console.log(
      `  - Adding SimplexController as controller on DefaultReverseRegistrar`,
    )
    await write(defaultReverseRegistrar, {
      functionName: 'setController',
      args: [controller.address, true],
      account: owner,
    })
  },
  {
    id: 'SimplexController v1.0.0',
    tags: ['category:simplex', 'SimplexController'],
    dependencies: [
      'ENSRegistry',
      'BaseRegistrarImplementation',
      'ExponentialPremiumPriceOracle',
      'ReverseRegistrar',
      'DefaultReverseRegistrar',
    ],
  },
)
