import { deployScript } from '@rocketh'
import { Artifact_DefaultReverseRegistrar } from 'generated/artifacts/DefaultReverseRegistrar.js'

export default deployScript(
  async ({ deploy, execute: write, namedAccounts }) => {
    const { deployer, owner } = namedAccounts

    const defaultReverseRegistrar = await deploy('DefaultReverseRegistrar', {
      account: deployer,
      artifact: Artifact_DefaultReverseRegistrar,
    })

    // Transfer ownership to owner
    if (owner !== deployer) {
      console.log(
        `  - Transferring ownership of DefaultReverseRegistrar to ${owner}`,
      )
      await write(defaultReverseRegistrar, {
        functionName: 'transferOwnership',
        args: [owner],
        account: deployer,
      })
    }

    return true;
  },
  {
    id: 'DefaultReverseRegistrar v1.0.0',
    tags: ['category:reverseregistrar', 'DefaultReverseRegistrar'],
    dependencies: [],
  },
)
