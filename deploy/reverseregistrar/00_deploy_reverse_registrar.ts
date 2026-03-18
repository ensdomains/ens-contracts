import { deployScript } from '@rocketh'
import type { Abi_ENSRegistry } from 'generated/abis/ENSRegistry.js'
import type { Abi_Root } from 'generated/abis/Root.js'
import { Artifact_ReverseRegistrar } from 'generated/artifacts/ReverseRegistrar.js'
import { labelhash, namehash } from 'viem'

export default deployScript(
  async ({ deploy, get, execute: write, namedAccounts, network, tags }) => {
    const { deployer, owner } = namedAccounts

    // Get dependencies
    const registry = get<Abi_ENSRegistry>('ENSRegistry')

    // Deploy ReverseRegistrar
    const reverseRegistrar = await deploy('ReverseRegistrar', {
      account: deployer,
      artifact: Artifact_ReverseRegistrar,
      args: [registry.address],
    })

    if (!reverseRegistrar.newlyDeployed) return

    // Transfer ownership to owner
    if (owner !== deployer) {
      console.log(`  - Transferring ownership of ReverseRegistrar to ${owner}`)
      await write(reverseRegistrar, {
        functionName: 'transferOwnership',
        args: [owner],
        account: deployer,
      })
    }

    // Only attempt to make controller etc changes directly on testnets
    if (network.chain.id === 1 && !tags?.tenderly) return

    const root = get<Abi_Root>('Root')
    console.log(`  - Setting owner of .reverse to owner on root`)
    await write(root, {
      functionName: 'setSubnodeOwner',
      args: [labelhash('reverse'), owner],
      account: owner,
    })

    console.log(
      `  - Setting owner of .addr.reverse to ReverseRegistrar on registry`,
    )
    await write(registry, {
      functionName: 'setSubnodeOwner',
      args: [namehash('reverse'), labelhash('addr'), reverseRegistrar.address],
      account: owner,
    })

    return true
  },
  {
    id: 'ReverseRegistrar v1.0.0',
    tags: ['category:reverseregistrar', 'ReverseRegistrar'],
    dependencies: ['ENSRegistry', 'Root'],
  },
)
