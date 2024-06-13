import { namehash } from 'ethers/lib/utils'
import { ethers } from 'hardhat'
import packet from 'dns-packet'
import type { DeployFunction } from 'hardhat-deploy/types.js'
import { HardhatRuntimeEnvironment } from 'hardhat/types'

function encodeName(name: string) {
  return '0x' + packet.name.encode(name).toString('hex')
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, deployments } = hre
  const { deploy } = deployments
  const { deployer, owner } = await getNamedAccounts()

  const registry = await ethers.getContract('ENSRegistry')
  const publicSuffixList = await ethers.getContract('SimplePublicSuffixList')
  const dnsRegistrar = await ethers.getContract('DNSRegistrar')

  const suffixList = await (
    await fetch('https://publicsuffix.org/list/public_suffix_list.dat')
  ).text()
  let suffixes = suffixList
    .split('\n')
    .filter((suffix) => !suffix.startsWith('//') && suffix.trim() != '')
  console.log(`Processing ${suffixes.length} public suffixes...`)

  for (let i = 0; i < suffixes.length; i++) {
    const suffix = suffixes[i]
    if (!suffix.match(/^[a-z0-9]+$/)) {
      continue
    }

    const node = namehash(suffix)

    const owner = await registry.owner(node)
    if (owner == dnsRegistrar.address) {
      console.log(`Skipping .${suffix}; already owned`)
      continue
    }

    const encodedSuffix = encodeName(suffix)
    if (!(await publicSuffixList.isPublicSuffix(encodedSuffix))) {
      console.log(`Skipping .${suffix}; not in the PSL`)
      continue
    }

    try {
      const tx = await dnsRegistrar.enableNode(encodedSuffix, {
        maxFeePerGas: 25000000000,
        maxPriorityFeePerGas: 1000000000,
      })
      console.log(`Enabling .${suffix} (${tx.hash})...`)
      await tx.wait()
    } catch (e) {
      console.log(`Error enabling .${suffix}: ${e.toString()}`)
    }
  }
}

func.tags = ['settlds']
func.dependencies = []

export default func
