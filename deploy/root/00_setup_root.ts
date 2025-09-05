import { artifacts, execute } from '@rocketh'
import { getAddress, zeroHash, type Address } from 'viem'

export default execute(
  async ({ get, read, execute: write, namedAccounts, network }) => {
    const { deployer, owner } = namedAccounts

    if (!network.tags.use_root) {
      console.warn('  - WARN: Skipping root setup (use_root not enabled)')
      return
    }

    console.log('  - Running root setup')

    const registry = get<(typeof artifacts.ENSRegistry)['abi']>('ENSRegistry')
    const root = get<(typeof artifacts.Root)['abi']>('Root')

    console.log(`  - Setting owner of root node to root contract`)
    await write(registry, {
      functionName: 'setOwner',
      args: [zeroHash, root.address],
      account: deployer,
    })

    const rootOwner = await read(root, {
      functionName: 'owner',
      args: [],
    }).then((v) => getAddress(v as Address))

    switch (rootOwner) {
      case getAddress(deployer):
        console.log(`  - Transferring ownership of root node to ${owner}`)
        await write(root, {
          functionName: 'transferOwnership',
          args: [owner],
          account: deployer,
        })
      case getAddress(owner):
        const ownerIsRootController = await read(root, {
          functionName: 'controllers',
          args: [owner],
        })
        if (!ownerIsRootController) {
          console.log(`  - Setting ${owner} as controller on root contract`)
          await write(root, {
            functionName: 'setController',
            args: [owner, true],
            account: owner,
          })
        }
        break
      default:
        console.warn(
          `  - WARN: Root is owned by ${rootOwner}; cannot transfer to owner account`,
        )
        break
    }

    return true
  },
  {
    id: 'Root:setup v1.0.0',
    tags: ['category:root', 'Root', 'Root:setup'],
    dependencies: ['Root:contract'],
  },
)
