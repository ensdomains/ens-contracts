import { artifacts, deployScript } from '@rocketh'

export default deployScript(
  async ({ deploy, get, execute: write, namedAccounts, network }) => {
    const { deployer, owner } = namedAccounts

    const registry = get<(typeof artifacts.ENSRegistry)['abi']>('ENSRegistry')
    const registrar = get<
      (typeof artifacts.BaseRegistrarImplementation)['abi']
    >('BaseRegistrarImplementation')

    const tld = process.env.SIMPLEX_TLD || 'testing'

    // On-chain NFT metadata renderer (swappable). tokenURI on the registrar
    // delegates here, passing the stored label, so the NFT title is the name.
    const renderer = await deploy('MetadataRenderer', {
      account: deployer,
      artifact: artifacts.MetadataRenderer,
      args: [`.${tld}`],
    })

    // SubnameRegistrar owns + resolves subnames, soulbound to the 2LD NFT.
    // NOTE: the authoritative SNRC deploy (scripts/deploy-*.mjs) deploys this
    // BEFORE the PublicResolver and sets the resolver's nameWrapper slot to it
    // (so subname records authorise via subnameRegistrar.ownerOf). The @rocketh
    // resolver deploys earlier, so here we only wire setResolver + setSubnameHook.
    const subnameRegistrar = await deploy('SubnameRegistrar', {
      account: deployer,
      artifact: artifacts.SubnameRegistrar,
      args: [registry.address, registrar.address],
    })

    if (!renderer.newlyDeployed) return
    if (network.name === 'mainnet' && !network.tags?.tenderly) return

    const resolver = get<(typeof artifacts.PublicResolver)['abi']>(
      'PublicResolver',
    )

    console.log(`  - Pointing BaseRegistrar.tokenURI at MetadataRenderer`)
    await write(registrar, {
      functionName: 'setMetadataRenderer',
      args: [renderer.address],
      account: owner,
    })

    // Cap label length at the DNS octet limit (63 bytes). Bounds labelOf storage
    // and on-chain SVG/JSON render size. (security.md L4)
    console.log(`  - Setting BaseRegistrar.maxLabelLength = 63`)
    await write(registrar, {
      functionName: 'setMaxLabelLength',
      args: [63n],
      account: owner,
    })

    console.log(`  - Wiring SubnameRegistrar resolver + re-registration hook`)
    await write(subnameRegistrar, {
      functionName: 'setResolver',
      args: [resolver.address],
      account: deployer,
    })
    await write(registrar, {
      functionName: 'setSubnameHook',
      args: [subnameRegistrar.address],
      account: owner,
    })
  },
  {
    id: 'SimplexMetadataAndSubnames v1.0.0',
    tags: ['category:simplex', 'MetadataRenderer', 'SubnameRegistrar'],
    dependencies: [
      'ENSRegistry',
      'BaseRegistrarImplementation',
      'SimplexController',
      'PublicResolver',
    ],
  },
)
