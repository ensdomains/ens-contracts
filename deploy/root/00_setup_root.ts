import { deployScript } from '@rocketh'
import { getAddress, zeroHash, type Address } from 'viem'
import type { Abi_ENSRegistry } from 'generated/abis/ENSRegistry.js'
import type { Abi_Root } from 'generated/abis/Root.js'
import type { Abi_RootSecurityController } from 'generated/abis/RootSecurityController.js'

export default deployScript(
  async ({ get, read, execute: write, namedAccounts, tags }) => {
    const { deployer, owner } = namedAccounts

    if (!tags.use_root) {
      console.warn('  - WARN: Skipping root setup (use_root not enabled)')
      return
    }

    console.log('  - Running root setup')

    const registry = get<Abi_ENSRegistry>('ENSRegistry')
    const root = get<Abi_Root>('Root')
    const rootSecurityController = get<
      Abi_RootSecurityController
    >('RootSecurityController')

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

        const securityControllerIsRootController = await read(root, {
          functionName: 'controllers',
          args: [rootSecurityController.address],
        })
        if (!securityControllerIsRootController) {
          console.log(
            `  - Setting RootSecurityController as controller on root contract`,
          )
          await write(root, {
            functionName: 'setController',
            args: [rootSecurityController.address, true],
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
    dependencies: ['Root:contract', 'RootSecurityController'],
  },
)
