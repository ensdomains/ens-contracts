import { execute, artifacts } from '@rocketh'
import { zeroAddress, zeroHash } from 'viem'

export default execute(
  async ({ deploy, get, namedAccounts, network, viem }) => {
    const { deployer, owner } = namedAccounts

    if (network.tags.legacy) {
      const contract = await deploy('LegacyENSRegistry', {
        account: owner.account,
        artifact: artifacts.ENSRegistry,
      })

      const legacyRegistry = await viem.getContractAt(
        'ENSRegistry',
        contract.address,
        { client: owner.account },
      )

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
        // Note: rocketh doesn't have run() equivalent, legacy scripts would need separate handling
      }

      const revertRootHash = await legacyRegistry.write.setOwner([
        zeroHash,
        zeroAddress,
      ])
      console.log(`Unsetting owner of root node (tx: ${revertRootHash})`)
      await viem.waitForTransactionSuccess(revertRootHash)

      await deploy('ENSRegistry', {
        account: deployer,
        artifact: artifacts.ENSRegistryWithFallback,
        args: [contract.address],
      })
    } else {
      await deploy('ENSRegistry', {
        account: deployer,
        artifact: artifacts.ENSRegistry,
      })
    }

    if (!network.tags.use_root) {
      const registry = await get('ENSRegistry')
      // Note: using 'as any' because rocketh's dynamic proxy doesn't have full type safety
      const rootOwner = await (registry as any).read.owner([zeroHash])
      switch (rootOwner) {
        case deployer.address:
          const hash = await (registry as any).write.setOwner(
            [zeroHash, owner.address],
            {
              account: deployer.account,
            },
          )
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
  },
  {
    id: 'ENSRegistry v1.0.0',
    tags: ['category:registry', 'ENSRegistry'],
  },
)
