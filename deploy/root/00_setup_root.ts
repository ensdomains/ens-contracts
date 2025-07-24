import { execute, artifacts } from '@rocketh'
import { zeroHash, encodeFunctionData } from 'viem'

export default execute(
  async ({ get, tx, namedAccounts, network, viem }) => {
    const { deployer, owner } = namedAccounts

    if (!network.tags.use_root) {
      console.log('Skipping root setup (use_root not enabled)')
      return
    }

    console.log('Running root setup')

    const registry = await get('ENSRegistry')
    const root = await get('Root')

    console.log(`ENS Registry at: ${registry.address}`)
    console.log(`Root contract at: ${root.address}`)

    try {
      // Transfer ownership of the root node to the root contract
      const tx1 = await tx({
        to: registry.address,
        data: encodeFunctionData({
          abi: registry.abi,
          functionName: 'setOwner',
          args: [zeroHash, root.address],
        }),
        account: deployer,
      })
      console.log('Transferred root node ownership to Root contract')

      // Set the owner of the root contract
      const tx2 = await tx({
        to: root.address,
        data: encodeFunctionData({
          abi: root.abi,
          functionName: 'setController',
          args: [owner, true],
        }),
        account: deployer,
      })
      console.log('Set root controller')

      console.log('Root setup completed successfully')
    } catch (error) {
      console.log('Root setup error:', error.message)
      console.log('Root setup completed with errors')
    }
  },
  {
    id: 'Root:setup v1.0.0',
    tags: ['category:root', 'Root', 'Root:setup'],
    dependencies: ['Root:contract'],
  },
)
