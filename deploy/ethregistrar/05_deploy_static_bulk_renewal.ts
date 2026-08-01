import { deployScript } from '@rocketh'
import type { Abi_ENSRegistry } from 'generated/abis/ENSRegistry.js'
import type { Abi_ETHRegistrarController } from 'generated/abis/ETHRegistrarController.js'
import { Artifact_OwnedResolver } from 'generated/artifacts/OwnedResolver.js'
import { Artifact_StaticBulkRenewal } from 'generated/artifacts/StaticBulkRenewal.js'
import { namehash, zeroAddress } from 'viem'
import { createInterfaceId } from '../../test/fixtures/createInterfaceId.js'

export default deployScript(
  async ({ deploy, execute: write, get, read, namedAccounts, network, tags }) => {
    const { deployer, owner } = namedAccounts

    const registry = get<Abi_ENSRegistry>('ENSRegistry')
    const controller = get<Abi_ETHRegistrarController>(
      'ETHRegistrarController',
    )

    const bulkRenewal = await deploy('StaticBulkRenewal', {
      account: deployer,
      artifact: Artifact_StaticBulkRenewal,
      args: [controller.address],
    })

    // Only attempt to make resolver etc changes directly on testnets
    if (network.chain.id === 1 && !tags.tenderly) return

    const interfaceId = createInterfaceId(bulkRenewal.abi)
    const resolver = await read(registry, {
      functionName: 'resolver',
      args: [namehash('eth')],
    })
    if (resolver === zeroAddress) {
      console.warn(
        `  - WARN: No resolver set for .eth; not setting interface ${interfaceId} for BulkRenewal`,
      )
      return
    }

    console.log(
      `  - Setting BulkRenewal interface ID ${interfaceId} on .eth resolver`,
    )
    await write(
      { ...Artifact_OwnedResolver, address: resolver },
      {
        functionName: 'setInterface',
        args: [namehash('eth'), interfaceId, bulkRenewal.address],
        account: owner,
      },
    )

    return true;
  },
  {
    id: 'StaticBulkRenewal v1.0.0',
    tags: ['category:ethregistrar', 'StaticBulkRenewal'],
    dependencies: ['ETHRegistrarController'],
  },
)
