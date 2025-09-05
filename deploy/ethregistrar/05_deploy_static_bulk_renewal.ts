import { artifacts, execute } from '@rocketh'
import { namehash, zeroAddress } from 'viem'
import { createInterfaceId } from '../../test/fixtures/createInterfaceId.js'

export default execute(
  async ({ deploy, execute: write, get, read, namedAccounts, network }) => {
    const { deployer, owner } = namedAccounts

    const registry = get<(typeof artifacts.ENSRegistry)['abi']>('ENSRegistry')
    const controller = get<(typeof artifacts.ETHRegistrarController)['abi']>(
      'ETHRegistrarController',
    )

    const bulkRenewal = await deploy('StaticBulkRenewal', {
      account: deployer,
      artifact: artifacts.StaticBulkRenewal,
      args: [controller.address],
    })

    // Only attempt to make resolver etc changes directly on testnets
    if (network.name === 'mainnet' && !network.tags.tenderly) return

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
      { ...artifacts.OwnedResolver, address: resolver },
      {
        functionName: 'setInterface',
        args: [namehash('eth'), interfaceId, bulkRenewal.address],
        account: owner,
      },
    )
  },
  {
    id: 'StaticBulkRenewal v1.0.0',
    tags: ['category:ethregistrar', 'StaticBulkRenewal'],
    dependencies: ['ETHRegistrarController'],
  },
)
