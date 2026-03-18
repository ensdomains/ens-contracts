import { deployScript } from '@rocketh'
import type { Abi_ENSRegistry } from 'generated/abis/ENSRegistry.js'
import { Artifact_ENSRegistry } from 'generated/artifacts/ENSRegistry.js'
import { Artifact_ENSRegistryWithFallback } from 'generated/artifacts/ENSRegistryWithFallback.js'
import { zeroAddress, zeroHash } from 'viem'

export default deployScript(
  async ({
    get,
    deploy,
    namedAccounts: { deployer, owner },
    execute: write,
    read,
    tags,
    createLegacyRegistryNames,
  }) => {
    if (tags.legacy) {
      console.log('Deploying Legacy ENS Registry...')
      const legacyRegistry = await deploy('LegacyENSRegistry', {
        account: deployer,
        artifact: Artifact_ENSRegistry,
      })

      if (createLegacyRegistryNames) {
        console.log('  - createLegacyRegistryNames hook exists, running setup')
        console.log('  - Setting owner of root node to owner')
        await write(legacyRegistry, {
          functionName: 'setOwner',
          args: [zeroHash, owner],
          account: deployer,
        })

        console.log(`  - Running createLegacyRegistryNames hook`)
        await createLegacyRegistryNames()

        console.log('  - Unsetting owner of root node')
        await write(legacyRegistry, {
          functionName: 'setOwner',
          args: [zeroHash, zeroAddress],
          account: deployer,
        })
      }

      console.log('Deploying ENS Registry with Fallback...')
      await deploy('ENSRegistry', {
        account: deployer,
        artifact: Artifact_ENSRegistryWithFallback,
        args: [legacyRegistry.address],
      })
    } else {
      console.log('Deploying standard ENS Registry...')
      await deploy('ENSRegistry', {
        account: deployer,
        artifact: Artifact_ENSRegistry,
      })
    }

    if (!tags.use_root) {
      const registry = get<Abi_ENSRegistry>('ENSRegistry')
      const rootOwner = await read(registry, {
        functionName: 'owner',
        args: [zeroHash],
      })
      if (rootOwner === deployer) {
        console.log('  - Setting final owner of root node on registry')
        await write(registry, {
          functionName: 'setOwner',
          args: [zeroHash, owner],
          account: deployer,
        })
      } else if (rootOwner !== owner) {
        console.warn(
          `  - WARN: Registry is owned by ${rootOwner}; cannot transfer to owner`,
        )
      }
    }

    return true;
  },
  {
    id: 'ENSRegistry v1.0.0',
    tags: ['category:registry', 'ENSRegistry'],
  },
)
