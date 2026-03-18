import { deployScript } from '@rocketh'
import { Artifact_MigrationHelper } from 'generated/artifacts/MigrationHelper.js'
import type { Abi_BaseRegistrarImplementation } from 'generated/abis/BaseRegistrarImplementation.js'
import type { Abi_NameWrapper } from 'generated/abis/NameWrapper.js'

export default deployScript(
  async ({ deploy, get, execute: write, namedAccounts }) => {
    const { deployer, owner } = namedAccounts

    const registrar = get<Abi_BaseRegistrarImplementation>('BaseRegistrarImplementation')
    const wrapper = get<Abi_NameWrapper>('NameWrapper')

    const migrationHelper = await deploy('MigrationHelper', {
      account: deployer,
      artifact: Artifact_MigrationHelper,
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
