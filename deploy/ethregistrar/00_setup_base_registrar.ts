import type { DeployFunction } from 'hardhat-deploy/types.js'
import { labelhash } from 'viem'

const func: DeployFunction = async function (hre) {
  const { network, viem } = hre

  const { deployer, owner } = await viem.getNamedClients()
  const publicClient = await viem.getPublicClient()

  if (!network.tags.use_root) {
    return true
  }

  const root = await viem.getContract('Root')
  const registrar = await viem.getContract('BaseRegistrarImplementation')

  console.log('Running base registrar setup')

  const transferOwnershipHash = await registrar.write.transferOwnership(
    [owner.address],
    { account: deployer.account },
  )
  console.log(
    `Transferring ownership of registrar to owner (tx: ${transferOwnershipHash})...`,
  )
  await viem.waitForTransactionSuccess(transferOwnershipHash)

  const setSubnodeOwnerHash = await root.write.setSubnodeOwner(
    [labelhash('eth'), registrar.address],
    { account: owner.account },
  )
  console.log(
    `Setting owner of eth node to registrar on root (tx: ${setSubnodeOwnerHash})...`,
  )
  await viem.waitForTransactionSuccess(setSubnodeOwnerHash)
}

func.id = 'setupRegistrar'
func.tags = ['setupRegistrar']
//Runs after the root is setup
func.dependencies = ['setupRoot']

export default func
