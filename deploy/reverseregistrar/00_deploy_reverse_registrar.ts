import type { DeployFunction } from 'hardhat-deploy/types.js'
import { labelhash, namehash } from 'viem'

const func: DeployFunction = async function (hre) {
  const { network, viem } = hre

  const { deployer, owner } = await viem.getNamedClients()

  const registry = await viem.getContract('ENSRegistry')

  const reverseRegistrarDeployment = await viem.deploy('ReverseRegistrar', [
    registry.address,
  ])
  if (!reverseRegistrarDeployment.newlyDeployed) return

  const reverseRegistrar = await viem.getContract('ReverseRegistrar')

  if (owner.address !== deployer.address) {
    const hash = await reverseRegistrar.write.transferOwnership([owner.address])
    console.log(
      `Transferring ownership of ReverseRegistrar to ${owner.address} (tx: ${hash})...`,
    )
    await viem.waitForTransactionSuccess(hash)
  }

  // Only attempt to make controller etc changes directly on testnets
  if (network.name === 'mainnet') return

  const root = await viem.getContract('Root')

  const setReverseOwnerHash = await root.write.setSubnodeOwner(
    [labelhash('reverse'), owner.address],
    { account: owner.account },
  )
  console.log(
    `Setting owner of .reverse to owner on root (tx: ${setReverseOwnerHash})...`,
  )
  await viem.waitForTransactionSuccess(setReverseOwnerHash)

  const setAddrOwnerHash = await registry.write.setSubnodeOwner(
    [namehash('reverse'), labelhash('addr'), reverseRegistrar.address],
    { account: owner.account },
  )
  console.log(
    `Setting owner of .addr.reverse to ReverseRegistrar on registry (tx: ${setAddrOwnerHash})...`,
  )
  await viem.waitForTransactionSuccess(setAddrOwnerHash)
}

func.id = 'reverse-registrar'
func.tags = ['ReverseRegistrar']
func.dependencies = ['root']

export default func
