import { execute, artifacts } from '@rocketh'

export default execute(
  async ({ deploy, get, namedAccounts, viem }) => {
    const { deployer, owner } = namedAccounts

    await deploy('DefaultReverseRegistrar', {
      account: deployer,
      artifact: artifacts.DefaultReverseRegistrar,
    })

    const defaultReverseRegistrar = await get('DefaultReverseRegistrar')

    // Transfer ownership to owner
    // Note: using 'as any' because rocketh's dynamic proxy doesn't have full type safety
    const defaultReverseRegistrarOwner = await (
      defaultReverseRegistrar as any
    ).read.owner()
    if (defaultReverseRegistrarOwner !== owner.address) {
      const hash = await (
        defaultReverseRegistrar as any
      ).write.transferOwnership([owner.address], {
        account: deployer,
      })
      console.log(
        `Transferring ownership of DefaultReverseRegistrar to ${owner.address} (tx: ${hash})...`,
      )
      await viem.waitForTransactionSuccess(hash)
    }
  },
  {
    id: 'DefaultReverseRegistrar v1.0.0',
    tags: ['category:reverseregistrar', 'DefaultReverseRegistrar'],
  },
)
