import { artifacts, deployScript } from '@rocketh'
import { encodeFunctionData, namehash, zeroAddress } from 'viem'

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

    // 1. Implementation. Its constructor calls _disableInitializers() so
    //    nobody can hijack the implementation contract itself.
    const implementation = await deploy('SimplexControllerImpl', {
      account: deployer,
      artifact: artifacts.SimplexController,
    })

    // 2. Atomically deploy ERC1967 proxy with initialize() call as
    //    constructor data. State is set in the same tx as deployment;
    //    no window where the proxy is uninitialised.
    const initData = encodeFunctionData({
      abi: artifacts.SimplexController.abi,
      functionName: 'initialize',
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
        owner,
      ],
    })

    const proxy = await deploy('SimplexController', {
      account: deployer,
      artifact: artifacts.SimplexControllerProxy,
      args: [implementation.address, initData],
    })

    if (!proxy.newlyDeployed) return

    if (network.name === 'mainnet' && !network.tags?.tenderly) return

    const controllerAddress = proxy.address

    console.log(`  - Adding SimplexController as controller on BaseRegistrar`)
    await write(registrar, {
      functionName: 'addController',
      args: [controllerAddress],
      account: owner,
    })

    console.log(
      `  - Adding SimplexController as controller on ReverseRegistrar`,
    )
    await write(reverseRegistrar, {
      functionName: 'setController',
      args: [controllerAddress, true],
      account: owner,
    })

    console.log(
      `  - Adding SimplexController as controller on DefaultReverseRegistrar`,
    )
    await write(defaultReverseRegistrar, {
      functionName: 'setController',
      args: [controllerAddress, true],
      account: owner,
    })
  },
  {
    id: 'SimplexController v2.0.0',
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
