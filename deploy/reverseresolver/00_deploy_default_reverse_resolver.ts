import type { DeployFunction } from 'hardhat-deploy/types.js'
import { labelhash, namehash } from 'viem'

const func: DeployFunction = async function (hre) {
  const { network, viem } = hre

  const { owner } = await viem.getNamedClients()

  const defaultReverseRegistrar = await viem.getContract(
    'DefaultReverseRegistrar',
  )

  const defaultReverseResolver = await viem.deploy('DefaultReverseResolver', [
    defaultReverseRegistrar.address,
  ])

  // Only attempt to make controller etc changes directly on testnets
  if (network.name === 'mainnet') return

  const registry = await viem.getContract('ENSRegistry')
  const root = await viem.getContract('Root')

  const currentRootOwner = await root.read.owner()
  const currentReverseOwner = await registry.read.owner([namehash('reverse')])
  if (currentReverseOwner !== owner.address) {
    if (currentRootOwner !== owner.address) {
      const setReverseOwnerHash = await root.write.setSubnodeOwner(
        [labelhash('reverse'), owner.address],
        { account: owner.account },
      )
      console.log(
        `Setting owner of .reverse to owner on root (tx: ${setReverseOwnerHash})...`,
      )
      await viem.waitForTransactionSuccess(setReverseOwnerHash)
    } else {
      console.warn(
        'Root owner account not available, skipping .reverse setup on registry',
      )
      return
    }
  }

  const setResolverHash = await registry.write.setResolver(
    [namehash('reverse'), defaultReverseResolver.address],
    {
      account: owner.account,
    },
  )
  console.log(
    `Setting resolver of .reverse to DefaultReverseResolver on registry (tx: ${setResolverHash})...`,
  )
  await viem.waitForTransactionSuccess(setResolverHash)
}

func.id = 'default-reverse-resolver'
func.tags = ['DefaultReverseResolver']
func.dependencies = ['DefaultReverseRegistrar']

export default func
