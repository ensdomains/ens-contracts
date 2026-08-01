import { deployScript } from '@rocketh'
import type { Abi_DefaultReverseRegistrar } from 'generated/abis/DefaultReverseRegistrar.js'
import type { Abi_ENSRegistry } from 'generated/abis/ENSRegistry.js'
import type { Abi_Root } from 'generated/abis/Root.js'
import { Artifact_DefaultReverseResolver } from 'generated/artifacts/DefaultReverseResolver.js'
import { getAddress, namehash } from 'viem'

export default deployScript(
  async ({ deploy, get, read, execute: write, namedAccounts, network, tags }) => {
    const { deployer, owner } = namedAccounts

    const defaultReverseRegistrar = get<
      Abi_DefaultReverseRegistrar
    >('DefaultReverseRegistrar')
    const registry = get<Abi_ENSRegistry>('ENSRegistry')
    const root = get<Abi_Root>('Root')

    const defaultReverseResolver = await deploy('DefaultReverseResolver', {
      account: deployer,
      artifact: Artifact_DefaultReverseResolver,
      args: [defaultReverseRegistrar.address],
    })

    if (network.chain.id === 1 && !tags.tenderly) return

    const currentRootOwner = await read(root, {
      functionName: 'owner',
      args: [],
    })
    const currentReverseOwner = await read(registry, {
      functionName: 'owner',
      args: [namehash('reverse')],
    })
    if (currentRootOwner === getAddress(owner) && currentReverseOwner !== getAddress(owner)) {
      console.log(`  - Setting owner of .reverse to owner on root`)
      await write(root, {
        functionName: 'transferOwnership',
        args: [owner],
        account: deployer,
      })
    } else if (currentRootOwner !== getAddress(owner)) {
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

    return true;
  },
  {
    id: 'DefaultReverseResolver v1.0.0',
    tags: ['category:reverseresolver', 'DefaultReverseResolver'],
    dependencies: ['ENSRegistry', 'Root', 'DefaultReverseRegistrar'],
  },
)
