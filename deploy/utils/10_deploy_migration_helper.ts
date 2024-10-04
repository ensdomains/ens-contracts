import type { DeployFunction } from 'hardhat-deploy/types.js'

const func: DeployFunction = async function (hre) {
  const { deployments, viem } = hre
  const { deploy } = deployments

  const { deployer, owner } = await viem.getNamedClients()

  const registrar = await viem.getContract('BaseRegistrarImplementation')
  const wrapper = await viem.getContract('NameWrapper')

  await viem.deploy('MigrationHelper', [registrar.address, wrapper.address])

  if (owner !== undefined && owner.address !== deployer.address) {
    const migrationHelper = await viem.getContract('MigrationHelper')
    const hash = await migrationHelper.write.transferOwnership([owner.address])
    console.log(`Transfer ownership to ${owner.address} (tx: ${hash})...`)
    await viem.waitForTransactionSuccess(hash)
  }
}

func.id = 'migration-helper'
func.tags = ['utils', 'MigrationHelper']
func.dependencies = ['BaseRegistrarImplementation', 'NameWrapper']

export default func
