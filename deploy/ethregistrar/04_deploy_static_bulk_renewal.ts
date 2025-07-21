import { execute, artifacts } from '@rocketh'

export default execute(
  async ({ deploy, get, namedAccounts }) => {
    const { deployer } = namedAccounts

    const controller = await get('ETHRegistrarController')

    await deploy('StaticBulkRenewal', {
      account: deployer,
      artifact: artifacts.StaticBulkRenewal,
      args: [controller.address],
    })
  },
  {
    id: 'StaticBulkRenewal v1.0.0',
    tags: ['category:ethregistrar', 'StaticBulkRenewal'],
    dependencies: ['ETHRegistrarController'],
  },
)
