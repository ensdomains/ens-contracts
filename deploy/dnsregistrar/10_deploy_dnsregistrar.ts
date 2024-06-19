import type { DeployFunction } from 'hardhat-deploy/types.js'
import { zeroAddress } from 'viem'

const func: DeployFunction = async function (hre) {
  const { viem } = hre

  const { owner } = await viem.getNamedClients()

  const registry = await viem.getContract('ENSRegistry')
  const dnssec = await viem.getContract('DNSSECImpl')
  const resolver = await viem.getContract('OffchainDNSResolver')
  const oldregistrar = await viem.getContractOrNull('DNSRegistrar')
  const root = await viem.getContract('Root')

  const publicSuffixList = await viem.getContract('SimplePublicSuffixList')

  const deployment = await viem.deploy('DNSRegistrar', [
    oldregistrar?.address || zeroAddress,
    resolver.address,
    dnssec.address,
    publicSuffixList.address,
    registry.address,
  ])

  const rootOwner = await root.read.owner()

  if (owner !== undefined && rootOwner === owner.address) {
    const hash = await root.write.setController([deployment.address, true], {
      account: owner.account,
    })
    console.log(`Set DNSRegistrar as controller of Root (${hash})`)
    await viem.waitForTransactionSuccess(hash)
  } else {
    console.log(
      `${owner.address} is not the owner of the root; you will need to call setController('${deployment.address}', true) manually`,
    )
  }
}

func.tags = ['DNSRegistrar']
func.dependencies = [
  'registry',
  'dnssec-oracle',
  'OffchainDNSResolver',
  'Root',
  'setupRoot',
]

export default func
