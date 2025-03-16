import type { DeployFunction } from 'hardhat-deploy/types.js'

const func: DeployFunction = async function (hre) {
  const { deployer, owner } = await hre.viem.getNamedClients()

  const registry = await hre.viem.getContract('ENSRegistry')
  const batchGatewayURLs = JSON.parse(process.env.BATCH_GATEWAY_URLS || '[]')

  if (batchGatewayURLs.length === 0) {
    throw new Error('UniversalResolver: No batch gateway URLs provided')
  }

  const ForwardResolution = await hre.viem.deploy('ForwardResolutionV1', [
    registry.address,
    batchGatewayURLs,
  ])

  const UniversalResolver = await hre.viem.deploy('UniversalResolver', [
    ForwardResolution.address,
  ])

  if (owner !== undefined && owner.address !== deployer.address) {
    for (const [name, { address }] of Object.entries({
      ForwardResolution,
      UniversalResolver,
    })) {
      const contract = await hre.viem.getContract(name)
      const hash = await contract.write.transferOwnership([owner.address])
      console.log(
        `Transfer ownership of ${name}<${address}> to ${owner.address} (tx: ${hash}, )...`,
      )
      await hre.viem.waitForTransactionSuccess(hash)
    }
  }
}

func.id = 'universal-resolver'
func.tags = ['utils', 'UniversalResolver']
func.dependencies = ['registry']

export default func
