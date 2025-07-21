import { execute, artifacts } from '@rocketh'
import { zeroHash } from 'viem'

export default execute(
  async ({ get, namedAccounts, network, viem }) => {
    const { deployer, owner } = namedAccounts

    if (!network.tags.use_root) {
      return
    }

    console.log('Running root setup')

    const registry = await get('ENSRegistry')
    const root = await get('Root')

    const setOwnerHash = await (registry as any).write.setOwner([
      zeroHash,
      root.address,
    ])
    console.log(
      `Setting owner of root node to root contract (tx: ${setOwnerHash})...`,
    )
    await viem.waitForTransactionSuccess(setOwnerHash)

    const rootOwner = await (root as any).read.owner()

    switch (rootOwner) {
      case deployer.address:
        const transferOwnershipHash = await (
          root as any
        ).write.transferOwnership([owner.address])
        console.log(
          `Transferring root ownership to final owner (tx: ${transferOwnershipHash})...`,
        )
        await viem.waitForTransactionSuccess(transferOwnershipHash)
      case owner.address:
        const ownerIsRootController = await (root as any).read.controllers([
          owner.address,
        ])
        if (!ownerIsRootController) {
          const setControllerHash = await (root as any).write.setController(
            [owner.address, true],
            { account: owner.account },
          )
          console.log(
            `Setting final owner as controller on root contract (tx: ${setControllerHash})...`,
          )
          await viem.waitForTransactionSuccess(setControllerHash)
        }
        break
      default:
        console.log(
          `WARNING: Root is owned by ${rootOwner}; cannot transfer to owner account`,
        )
    }
  },
  {
    id: 'Root:setup v1.0.0',
    tags: ['category:root', 'Root', 'Root:setup'],
    dependencies: ['Root:contract'],
  },
)
