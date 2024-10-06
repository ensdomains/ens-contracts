import type { DeployFunction } from 'hardhat-deploy/types.js'
import { zeroAddress, zeroHash } from 'viem'

const func: DeployFunction = async function (hre) {
  const { deployments, network, viem } = hre
  const { run } = deployments

  const { deployer, owner } = await viem.getNamedClients()

  if (network.tags.legacy) {
    const contract = await viem.deploy('LegacyENSRegistry', [], {
      client: owner,
      artifact: await deployments.getArtifact('ENSRegistry'),
    })

    const legacyRegistry = await viem.getContract('LegacyENSRegistry', owner)

    const setRootHash = await legacyRegistry.write.setOwner(
      [zeroHash, owner.address],
      {
        gas: 1000000n,
      },
    )
    console.log(`Setting owner of root node to owner (tx: ${setRootHash})`)
    await viem.waitForTransactionSuccess(setRootHash)

    if (process.env.npm_package_name !== '@ensdomains/ens-contracts') {
      console.log('Running legacy registry scripts...')
      await run('legacy-registry-names', {
        deletePreviousDeployments: false,
        resetMemory: false,
      })
    }

    const revertRootHash = await legacyRegistry.write.setOwner([
      zeroHash,
      zeroAddress,
    ])
    console.log(`Unsetting owner of root node (tx: ${revertRootHash})`)
    await viem.waitForTransactionSuccess(revertRootHash)

    await viem.deploy('ENSRegistry', [contract.address], {
      artifact: await deployments.getArtifact('ENSRegistryWithFallback'),
    })
  } else {
    await viem.deploy('ENSRegistry', [], {
      artifact: await deployments.getArtifact('ENSRegistry'),
    })
  }

  if (!network.tags.use_root) {
    const registry = await viem.getContract('ENSRegistry')
    const rootOwner = await registry.read.owner([zeroHash])
    switch (rootOwner) {
      case deployer.address:
        const hash = await registry.write.setOwner([zeroHash, owner.address], {
          account: deployer.account,
        })
        console.log(
          `Setting final owner of root node on registry (tx:${hash})...`,
        )
        await viem.waitForTransactionSuccess(hash)
        break
      case owner.address:
        break
      default:
        console.log(
          `WARNING: ENS registry root is owned by ${rootOwner}; cannot transfer to owner`,
        )
    }
  }

  return true
}

func.id = 'ens'
func.tags = ['registry', 'ENSRegistry']

export default func
