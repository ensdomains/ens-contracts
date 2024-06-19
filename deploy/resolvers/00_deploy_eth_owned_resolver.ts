import type { DeployFunction } from 'hardhat-deploy/types.js'
import { namehash } from 'viem'

const func: DeployFunction = async function (hre) {
  const { viem } = hre

  const { owner } = await viem.getNamedClients()

  const ethOwnedResolver = await viem.deploy('OwnedResolver', [])

  if (!ethOwnedResolver.newlyDeployed) return

  const registry = await viem.getContract('ENSRegistry')
  const registrar = await viem.getContract('BaseRegistrarImplementation')

  const setResolverHash = await registrar.write.setResolver(
    [ethOwnedResolver.address],
    { account: owner.account },
  )
  await viem.waitForTransactionSuccess(setResolverHash)

  const resolver = await registry.read.resolver([namehash('eth')])
  console.log(`set resolver for .eth to ${resolver}`)
  if (!ethOwnedResolver.newlyDeployed) return
}

func.id = 'eth-owned-resolver'
func.tags = ['resolvers', 'OwnedResolver', 'EthOwnedResolver']
func.dependencies = ['Registry']

export default func
