/* eslint-disable import/no-extraneous-dependencies */
import fs from 'fs/promises'
import { resolve } from 'path'

import { DeployFunction } from 'hardhat-deploy/types.js'
import { HardhatRuntimeEnvironment } from 'hardhat/types'

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, deployments, viem } = hre
  const allNamedAccts = await getNamedAccounts()
  const { deployer } = allNamedAccts

  const registry = await viem.getContract('ENSRegistry')
  const nameWrapper = await viem.getContract('NameWrapper')
  const ethController = await viem.getContract('ETHRegistrarController')
  const reverseRegistrar = await viem.getContract('ReverseRegistrar')

  await deployments.deploy('OutdatedResolver', {
    from: deployer,
    contract: JSON.parse(
      await fs.readFile(resolve(__dirname, './.contracts/OutdatedResolverV1.json'), {
        encoding: 'utf8',
      }),
    ),
    args: [registry.address],
  })

  await deployments.deploy('CustomOutdatedResolver', {
    from: deployer,
    contract: JSON.parse(
      await fs.readFile(resolve(__dirname, './.contracts/OutdatedResolverV3.json'), {
        encoding: 'utf8',
      }),
    ),
    args: [registry.address],
  })

  await deployments.deploy('CustomLegacyResolver', {
    from: deployer,
    contract: JSON.parse(
      await fs.readFile(resolve(__dirname, './.contracts/CustomLegacyResolver.json'), {
        encoding: 'utf8',
      }),
    ),
    args: [registry.address],
  })

  await deployments.deploy('CustomNameWrapperAwareResolver', {
    from: deployer,
    contract: JSON.parse(
      await fs.readFile(resolve(__dirname, './.contracts/CustomNameWrapperAwareResolver.json'), {
        encoding: 'utf8',
      }),
    ),
    args: [registry.address, nameWrapper.address, ethController.address, reverseRegistrar.address],
  })

  console.log('Finished deploying legacy resolvers')

  return true
}

func.id = 'deploy-legacy-resolvers'
func.tags = ['deploy-legacy-resolvers']
func.runAtTheEnd = true

module.exports = func
