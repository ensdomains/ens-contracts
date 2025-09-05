import { artifacts, execute } from '@rocketh'

export default execute(
  async ({ deploy, get, execute: write, namedAccounts }) => {
    const { deployer, owner } = namedAccounts

    const registrar = get<
      (typeof artifacts.BaseRegistrarImplementation)['abi']
    >('BaseRegistrarImplementation')
    const wrapper = get<(typeof artifacts.NameWrapper)['abi']>('NameWrapper')

    const migrationHelper = await deploy('MigrationHelper', {
      account: deployer,
      artifact: artifacts.MigrationHelper,
      args: [registrar.address, wrapper.address],
    })

    if (owner && owner !== deployer) {
      console.log(`  - Transferring ownership to ${owner}`)
      await write(migrationHelper, {
        account: deployer,
        functionName: 'transferOwnership',
        args: [owner],
      })
    }

    return true
  },
  {
    id: 'MigrationHelper v1.0.0',
    tags: ['category:utils', 'MigrationHelper'],
    dependencies: ['BaseRegistrarImplementation', 'NameWrapper'],
  },
)
