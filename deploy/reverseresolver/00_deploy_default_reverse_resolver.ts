import { execute, artifacts } from '@rocketh'

export default execute(
  async ({ deploy, get, namedAccounts }) => {
    const { deployer } = namedAccounts

    const defaultReverseRegistrar = await get('DefaultReverseRegistrar')

    await deploy('DefaultReverseResolver', {
      account: deployer,
      artifact: artifacts.DefaultReverseResolver,
      args: [defaultReverseRegistrar.address],
    })
  },
  {
    id: 'DefaultReverseResolver v1.0.0',
    tags: ['category:reverseresolver', 'DefaultReverseResolver'],
    dependencies: ['DefaultReverseRegistrar'],
  },
)
