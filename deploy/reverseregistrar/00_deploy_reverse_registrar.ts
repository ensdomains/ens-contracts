import { execute, artifacts } from '@rocketh'
import { labelhash, namehash, zeroHash, encodeFunctionData } from 'viem'

export default execute(
  async ({ deploy, get, tx, namedAccounts, network, viem }) => {
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
    if (owner !== deployer) {
      const transferTx = await tx({
        to: reverseRegistrar.address,
        data: encodeFunctionData({
          abi: reverseRegistrar.abi,
          functionName: 'transferOwnership',
          args: [owner],
        }),
        account: owner,
      })
      console.log(`Transferred ownership of ReverseRegistrar to ${owner}`)
    }

    // Only attempt to make controller etc changes directly on testnets
    if (network.name === 'mainnet' && !network.tags?.tenderly) return

    try {
      // Calculate hashes for clarity
      const reverseLabel = labelhash('reverse')
      const addrLabel = labelhash('addr')
      const reverseNode = namehash('reverse')
      const addrReverseNode = namehash('addr.reverse')

      console.log('Setting up reverse registrar nodes...')
      console.log('  reverse label hash:', reverseLabel)
      console.log('  addr label hash:', addrLabel)
      console.log('  reverse node hash:', reverseNode)
      console.log('  addr.reverse node hash:', addrReverseNode)
      console.log('  Setting .reverse owner from', deployer, 'to', owner)

      // Set owner of .reverse to owner on root
      const root = await get('Root')
      const tx1 = await tx({
        to: root.address,
        data: encodeFunctionData({
          abi: root.abi,
          functionName: 'setSubnodeOwner',
          args: [reverseLabel, owner],
        }),
        account: owner,
      })
      console.log('Set owner of .reverse to owner on root, tx:', tx1)
      console.log('Transaction confirmed')

      console.log(
        '  Setting .addr.reverse owner from',
        owner,
        'to',
        reverseRegistrar.address,
      )

      // Set owner of .addr.reverse to ReverseRegistrar on registry
      const tx2 = await tx({
        to: registry.address,
        data: encodeFunctionData({
          abi: registry.abi,
          functionName: 'setSubnodeOwner',
          args: [reverseNode, addrLabel, reverseRegistrar.address],
        }),
        account: owner,
      })
      console.log(
        'Set owner of .addr.reverse to ReverseRegistrar on registry, tx:',
        tx2,
      )
      console.log('Transaction confirmed')

      console.log('Reverse registrar setup completed successfully')
    } catch (error) {
      console.log('Reverse registrar setup error:', error.message)
      console.log('Full error:', error)
      console.log('Reverse registrar setup completed with errors')
    }
  },
  {
    id: 'ReverseRegistrar v1.0.0',
    tags: ['category:reverseregistrar', 'ReverseRegistrar'],
    dependencies: ['ENSRegistry', 'Root'],
  },
)
