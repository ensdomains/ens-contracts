import { artifacts, deployScript } from '@rocketh'
import { namehash } from 'viem'

export default deployScript(
  async ({ deploy, get, read, execute: write, namedAccounts, network }) => {
    const { deployer, owner } = namedAccounts

    const defaultReverseRegistrar = get<
      (typeof artifacts.DefaultReverseRegistrar)['abi']
    >('DefaultReverseRegistrar')
    const registry = get<(typeof artifacts.ENSRegistry)['abi']>('ENSRegistry')
    const root = get<(typeof artifacts.Root)['abi']>('Root')

    const defaultReverseResolver = await deploy('DefaultReverseResolver', {
      account: deployer,
      artifact: artifacts.DefaultReverseResolver,
      args: [defaultReverseRegistrar.address],
    })

    if (network.name === 'mainnet' && !network.tags.tenderly) return

    const currentRootOwner = await read(root, {
      functionName: 'owner',
      args: [],
    })
    const currentReverseOwner = await read(registry, {
      functionName: 'owner',
      args: [namehash('reverse')],
    })
    if (currentRootOwner === owner && currentReverseOwner !== owner) {
      console.log(`  - Setting owner of .reverse to owner on root`)
      await write(root, {
        functionName: 'transferOwnership',
        args: [owner],
        account: deployer,
      })
    } else if (currentRootOwner !== owner) {
      console.warn(
        `  - WARN: Root owner account not available, skipping .reverse setup on registry`,
      )
      return
    }

    console.log(
      `  - Setting resolver of .reverse to DefaultReverseResolver on registry`,
    )
    await write(registry, {
      functionName: 'setResolver',
      args: [namehash('reverse'), defaultReverseResolver.address],
      account: owner,
    })
  },
  {
    id: 'DefaultReverseResolver v1.0.0',
    tags: ['category:reverseresolver', 'DefaultReverseResolver'],
    dependencies: ['ENSRegistry', 'Root', 'DefaultReverseRegistrar'],
  },
)
