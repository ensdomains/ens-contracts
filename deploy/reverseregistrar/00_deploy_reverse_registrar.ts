import { execute, artifacts } from '@rocketh'
import { labelhash, namehash } from 'viem'

export default execute(
  async ({ deploy, get, namedAccounts, network, viem }) => {
    const { deployer, owner } = namedAccounts

    // Get dependencies
    const registry = await get('ENSRegistry')

    // Deploy ReverseRegistrar
    const reverseRegistrarDeployment = await deploy('ReverseRegistrar', {
      account: deployer,
      artifact: artifacts.ReverseRegistrar,
      args: [registry.address],
    })

    if (!reverseRegistrarDeployment.newlyDeployed) return

    const reverseRegistrar = await get('ReverseRegistrar')

    // Transfer ownership to owner
    // Note: using 'as any' because rocketh's dynamic proxy doesn't have full type safety
    if (owner.address !== deployer.address) {
      const hash = await (reverseRegistrar as any).write.transferOwnership(
        [owner.address],
        {
          account: deployer,
        },
      )
      console.log(
        `Transferring ownership of ReverseRegistrar to ${owner.address} (tx: ${hash})...`,
      )
      await viem.waitForTransactionSuccess(hash)
    }

    // Only attempt to make controller etc changes directly on testnets
    if (network.name === 'mainnet' && !network.tags?.tenderly) return

    const root = await get('Root')

    // Set owner of .reverse to owner on root
    const setReverseOwnerHash = await (root as any).write.setSubnodeOwner(
      [labelhash('reverse'), owner.address],
      { account: owner.account },
    )
    console.log(
      `Setting owner of .reverse to owner on root (tx: ${setReverseOwnerHash})...`,
    )
    await viem.waitForTransactionSuccess(setReverseOwnerHash)

    // Set owner of .addr.reverse to ReverseRegistrar on registry
    const setAddrOwnerHash = await (registry as any).write.setSubnodeOwner(
      [namehash('reverse'), labelhash('addr'), reverseRegistrar.address],
      { account: owner.account },
    )
    console.log(
      `Setting owner of .addr.reverse to ReverseRegistrar on registry (tx: ${setAddrOwnerHash})...`,
    )
    await viem.waitForTransactionSuccess(setAddrOwnerHash)
  },
  {
    id: 'ReverseRegistrar v1.0.0',
    tags: ['category:reverseregistrar', 'ReverseRegistrar'],
    dependencies: ['ENSRegistry', 'Root'],
  },
)
