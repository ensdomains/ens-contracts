import { execute, artifacts } from '@rocketh'

export default execute(
  async ({ deploy, get, namedAccounts, viem }) => {
    const { deployer, owner } = namedAccounts

    const registrar = await get('BaseRegistrarImplementation')
    const wrapper = await get('NameWrapper')

    await deploy('MigrationHelper', {
      account: deployer,
      artifact: artifacts.MigrationHelper,
      args: [registrar.address, wrapper.address],
    })

    if (owner && owner.address !== deployer.address) {
      const migrationHelper = await get('MigrationHelper')
      // Note: using 'as any' because rocketh's dynamic proxy doesn't have full type safety
      const hash = await (migrationHelper as any).write.transferOwnership(
        [owner.address],
        {
          account: deployer,
        },
      )
      console.log(`Transfer ownership to ${owner.address} (tx: ${hash})...`)
      await viem.waitForTransactionSuccess(hash)
    }
  },
  {
    id: 'MigrationHelper v1.0.0',
    tags: ['category:utils', 'MigrationHelper'],
    dependencies: ['BaseRegistrarImplementation', 'NameWrapper'],
  },
)
