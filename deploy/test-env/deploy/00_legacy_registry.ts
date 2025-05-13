/* eslint-disable import/no-extraneous-dependencies, import/extensions */
import { DeployFunction } from 'hardhat-deploy/types.js'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { labelhash, namehash } from 'viem'

const ZERO_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000'

const names = ['legacy']

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { viem } = hre
  const { owner } = await viem.getNamedClients()

  const registry = await viem.getContract('LegacyENSRegistry' as 'ENSRegistry', owner)

  const tldTx = await registry.write.setSubnodeOwner(
    [ZERO_HASH, labelhash('test'), owner.address],
    { chain: owner.public.chain, account: owner.account },
  )
  console.log(`Creating .test TLD (tx: ${tldTx})...`)

  await Promise.all(
    names.map(async (name) => {
      const nameTx = await registry.write.setSubnodeOwner(
        [namehash('test'), labelhash(name), owner.address],
        { chain: owner.public.chain, account: owner.account },
      )
      console.log(`Creating ${name}.test (tx: ${nameTx})...`)
    }),
  )

  return true
}

func.id = 'legacy-registry-names'
func.tags = ['legacy-registry-names']
func.dependencies = ['ENSRegistry']
func.skip = async function (hre: HardhatRuntimeEnvironment) {
  const { viem } = hre
  const { owner } = await viem.getNamedClients()

  const registry = await viem.getContract('LegacyENSRegistry' as 'ENSRegistry', owner)

  const ownerOfTestTld = await registry.read.owner([namehash('test')])
  if (ownerOfTestTld !== owner.address) {
    return false
  }
  return true
}
func.runAtTheEnd = true

export default func
